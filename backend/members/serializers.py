from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import (
    AttendanceCheckin,
    GymSetting,
    Member,
    MemberCharge,
    MemberNote,
    MembershipHistory,
    Payment,
    RecordedMemberPaymentStatus,
)
from .finance import member_financial_summary
from .utils import (
    attendance_membership_status,
    end_date_for_plan,
    member_may_check_in_for_attendance,
)
from .validators import normalize_lebanon_phone


class AdminTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        if not self.user.is_staff:
            raise serializers.ValidationError(
                {"detail": "Only administrator accounts can sign in."}
            )
        return data


class MemberSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField(read_only=True)
    membership_status = serializers.SerializerMethodField(read_only=True)
    latest_payment_status = serializers.SerializerMethodField(read_only=True)
    total_paid = serializers.SerializerMethodField(read_only=True)
    total_charged = serializers.SerializerMethodField(read_only=True)
    outstanding_amount = serializers.SerializerMethodField(read_only=True)
    account_balance = serializers.SerializerMethodField(read_only=True)
    balance_status = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Member
        fields = (
            "id",
            "id_number",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "phone",
            "plan",
            "custom_plan_name",
            "discount_percent",
            "member_payment_status",
            "payment_received_on",
            "start_date",
            "end_date",
            "membership_status",
            "latest_payment_status",
            "total_paid",
            "total_charged",
            "outstanding_amount",
            "account_balance",
            "balance_status",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "id_number",
            "full_name",
            "created_at",
            "updated_at",
        )

    def get_full_name(self, obj):
        if hasattr(obj, "full_name_text"):
            return obj.full_name_text
        return f"{obj.first_name} {obj.last_name}".strip()

    def get_membership_status(self, obj):
        today = timezone.localdate()
        if obj.member_payment_status != RecordedMemberPaymentStatus.PAID:
            return "not_active"
        if obj.end_date >= today:
            return "active"
        return "expired"

    def get_latest_payment_status(self, obj):
        if hasattr(obj, "latest_payment_status"):
            return obj.latest_payment_status
        p = obj.payments.order_by("-created_at").first()
        return p.status if p else None

    def _financial_summary(self, obj):
        summary = getattr(obj, "_financial_summary", None)
        if summary is None:
            summary = member_financial_summary(obj.id)
            setattr(obj, "_financial_summary", summary)
        return summary

    def get_total_paid(self, obj):
        return self._financial_summary(obj)["total_paid"]

    def get_total_charged(self, obj):
        return self._financial_summary(obj)["total_charged"]

    def get_outstanding_amount(self, obj):
        return self._financial_summary(obj)["outstanding_amount"]

    def get_account_balance(self, obj):
        return self._financial_summary(obj)["account_balance"]

    def get_balance_status(self, obj):
        return self._financial_summary(obj)["balance_status"]


class MemberWriteSerializer(serializers.ModelSerializer):
    """If end_date is omitted or null, it is set from start_date and plan."""

    end_date = serializers.DateField(required=False, allow_null=True)
    payment_received_on = serializers.DateField(required=False, allow_null=True)
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(
        max_length=100, required=False, allow_blank=True, default=""
    )

    class Meta:
        model = Member
        fields = (
            "first_name",
            "last_name",
            "email",
            "phone",
            "plan",
            "custom_plan_name",
            "discount_percent",
            "member_payment_status",
            "payment_received_on",
            "start_date",
            "end_date",
        )

    def validate_first_name(self, value):
        if not (value and str(value).strip()):
            raise serializers.ValidationError("First name is required.")
        return str(value).strip()[:100]

    def validate_last_name(self, value):
        if value is None:
            return ""
        return str(value).strip()[:100]

    def validate_phone(self, value):
        if not self.instance:
            if not value or not str(value).strip():
                raise serializers.ValidationError(
                    "Phone is required. Lebanon E.164: +961 and 8 digits, e.g. +96131234567."
                )
            try:
                return normalize_lebanon_phone(value)
            except ValueError as e:
                raise serializers.ValidationError(str(e)) from e
        if value is None or (isinstance(value, str) and not str(value).strip()):
            return ""
        try:
            return normalize_lebanon_phone(value)
        except ValueError as e:
            raise serializers.ValidationError(str(e)) from e

    def validate(self, attrs):
        instance = self.instance
        discount = attrs.get("discount_percent")
        if discount is not None and (discount < 0 or discount > 100):
            raise serializers.ValidationError(
                {"discount_percent": "Discount must be between 0 and 100."}
            )
        if not instance and "member_payment_status" not in attrs:
            attrs["member_payment_status"] = RecordedMemberPaymentStatus.PENDING
        if attrs.get("member_payment_status") == RecordedMemberPaymentStatus.PENDING:
            attrs["payment_received_on"] = None

        start = attrs.get("start_date", getattr(instance, "start_date", None))
        plan = attrs.get("plan", getattr(instance, "plan", None))

        recompute = False
        if not instance:
            recompute = "end_date" not in attrs or attrs.get("end_date") is None
        else:
            if "end_date" in attrs and attrs.get("end_date") is None:
                recompute = True
            elif (
                "start_date" in attrs or "plan" in attrs
            ) and "end_date" not in attrs:
                recompute = True

        if recompute and start and plan:
            attrs["end_date"] = end_date_for_plan(start, plan)
        return attrs

    def update(self, instance, validated_data):
        validated_data.pop("id_number", None)
        return super().update(instance, validated_data)


class AssignMembershipSerializer(serializers.Serializer):
    plan = serializers.ChoiceField(choices=Member.Plan.choices)
    start_date = serializers.DateField()
    end_date = serializers.DateField(required=False, allow_null=True)

    def save(self, **kwargs):
        member = kwargs["member"]
        end_date = self.validated_data.get("end_date")
        plan = self.validated_data["plan"]
        start_date = self.validated_data["start_date"]
        if end_date is None:
            end_date = end_date_for_plan(start_date, plan)
        member.plan = plan
        member.start_date = start_date
        member.end_date = end_date
        member.save()
        return member


class RenewMembershipSerializer(serializers.Serializer):
    plan = serializers.ChoiceField(choices=Member.Plan.choices, required=False)

    def save(self, **kwargs):
        from .utils import renew_membership

        member = kwargs["member"]
        plan = self.validated_data.get("plan")
        return renew_membership(member, plan=plan)


class PaymentSerializer(serializers.ModelSerializer):
    member_name = serializers.SerializerMethodField()
    member_id_number = serializers.CharField(source="member.id_number", read_only=True)
    computed_status = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = (
            "id",
            "member",
            "member_name",
            "member_id_number",
            "amount",
            "purpose",
            "status",
            "computed_status",
            "method",
            "payment_date",
            "due_date",
            "invoice_number",
            "notes",
            "paid_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at", "paid_at")

    def get_member_name(self, obj):
        if hasattr(obj, "member_name"):
            return obj.member_name
        return obj.member.display_name()

    def get_computed_status(self, obj):
        if (
            obj.status == Payment.Status.PENDING
            and obj.due_date
            and obj.due_date < timezone.localdate()
        ):
            return Payment.Status.OVERDUE
        return obj.status


class PaymentWriteSerializer(serializers.ModelSerializer):
    mark_as_paid = serializers.BooleanField(required=False, write_only=True, default=False)

    class Meta:
        model = Payment
        fields = (
            "member",
            "amount",
            "purpose",
            "mark_as_paid",
            "method",
            "payment_date",
            "due_date",
            "notes",
        )

    def validate(self, attrs):
        raw_status = self.initial_data.get("status")
        if raw_status is not None and raw_status not in (
            Payment.Status.PENDING,
            Payment.Status.PAID,
        ):
            raise serializers.ValidationError(
                {"status": "Status can only be pending or paid at creation."}
            )
        if "invoice_number" in self.initial_data:
            raise serializers.ValidationError(
                {"invoice_number": "Invoice number is generated by the backend."}
            )
        amount = attrs.get("amount")
        if amount is not None and amount <= 0:
            raise serializers.ValidationError({"amount": "Amount must be greater than 0."})
        return attrs

    def create(self, validated_data):
        mark_as_paid = validated_data.pop("mark_as_paid", False)
        incoming_status = self.initial_data.get("status")
        status = Payment.Status.PAID if mark_as_paid else Payment.Status.PENDING
        if incoming_status is not None:
            if incoming_status not in (Payment.Status.PENDING, Payment.Status.PAID):
                raise serializers.ValidationError(
                    {"status": "Status can only be pending or paid at creation."}
                )
            status = incoming_status

        paid_at = None
        if status == Payment.Status.PAID:
            paid_at = timezone.now()

        validated_data["status"] = status
        max_retries = 5
        for _ in range(max_retries):
            try:
                with transaction.atomic():
                    invoice_number = Payment.generate_invoice_number()
                    return Payment.objects.create(
                        paid_at=paid_at,
                        invoice_number=invoice_number,
                        **validated_data,
                    )
            except IntegrityError:
                # Collision can happen under concurrent writes; regenerate and retry.
                continue
        raise serializers.ValidationError(
            {"invoice_number": "Could not generate a unique invoice number. Please retry."}
        )


class PaymentUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ("amount", "status", "purpose", "method", "payment_date", "due_date", "notes")

    def update(self, instance, validated_data):
        amount = validated_data.get("amount")
        if amount is not None and amount <= 0:
            raise serializers.ValidationError({"amount": "Amount must be greater than 0."})
        new_status = validated_data.get("status", instance.status)
        if new_status == Payment.Status.PAID and not instance.paid_at:
            instance.paid_at = timezone.now()
        return super().update(instance, validated_data)


class MemberChargeSerializer(serializers.ModelSerializer):
    class Meta:
        model = MemberCharge
        fields = (
            "id",
            "member",
            "title",
            "purpose",
            "amount",
            "status",
            "due_date",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "member", "created_at", "updated_at")


class MemberChargeWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = MemberCharge
        fields = ("title", "purpose", "amount", "status", "due_date", "notes")

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than 0.")
        return value


class MemberNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = MemberNote
        fields = ("id", "member", "body", "created_at", "updated_at")
        read_only_fields = ("created_at", "updated_at")


class MembershipHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MembershipHistory
        fields = (
            "id",
            "member",
            "event",
            "plan",
            "start_date",
            "end_date",
            "payment_status",
            "created_at",
        )
        read_only_fields = fields


class AttendanceCheckinSerializer(serializers.ModelSerializer):
    member_name = serializers.SerializerMethodField(read_only=True)
    member_id_number = serializers.CharField(source="member.id_number", read_only=True)
    membership_status = serializers.SerializerMethodField(read_only=True)
    duration_seconds = serializers.SerializerMethodField(read_only=True)
    is_in_gym = serializers.SerializerMethodField(read_only=True)
    recorded_by_username = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = AttendanceCheckin
        fields = (
            "id",
            "member",
            "member_name",
            "member_id_number",
            "membership_status",
            "source",
            "check_in_time",
            "check_out_time",
            "duration_seconds",
            "is_in_gym",
            "recorded_by_username",
        )
        read_only_fields = (
            "check_in_time",
            "check_out_time",
            "membership_status",
            "duration_seconds",
            "is_in_gym",
            "recorded_by_username",
        )

    def get_member_name(self, obj):
        if hasattr(obj, "member_name"):
            return obj.member_name
        return obj.member.display_name()

    def get_membership_status(self, obj):
        return attendance_membership_status(obj.member)

    def get_duration_seconds(self, obj):
        if obj.check_out_time:
            delta = obj.check_out_time - obj.check_in_time
            return int(delta.total_seconds())
        return None

    def get_is_in_gym(self, obj):
        return obj.check_out_time is None

    def get_recorded_by_username(self, obj):
        u = getattr(obj, "recorded_by", None)
        if not u:
            return None
        return u.get_username()


def _quick_resolve_member(attrs):
    explicit = attrs.get("member")
    if explicit:
        attrs["member"] = explicit
        return attrs

    id_number = (attrs.get("id_number") or "").strip()
    search = (attrs.get("search") or "").strip()
    if not id_number and not search:
        raise serializers.ValidationError(
            {"error": "Provide member, id_number, or search."}
        )
    member = None
    if id_number:
        member = Member.objects.filter(id_number__iexact=id_number).first()
    if not member and search:
        member = (
            Member.objects.filter(first_name__icontains=search)
            | Member.objects.filter(last_name__icontains=search)
            | Member.objects.filter(id_number__icontains=search)
        ).first()
    if not member:
        raise serializers.ValidationError({"error": "Member not found."})
    attrs["member"] = member
    return attrs


class QuickCheckinSerializer(serializers.Serializer):
    member = serializers.PrimaryKeyRelatedField(
        queryset=Member.objects.all(), required=False, allow_null=False
    )
    id_number = serializers.CharField(required=False, allow_blank=True)
    search = serializers.CharField(required=False, allow_blank=True)
    source = serializers.ChoiceField(
        required=False,
        choices=AttendanceCheckin.Source.choices,
        default=AttendanceCheckin.Source.DESK,
    )

    def validate(self, attrs):
        _quick_resolve_member(attrs)
        member = attrs["member"]
        if not member_may_check_in_for_attendance(member):
            raise serializers.ValidationError(
                {"error": "Cannot check in. Membership is not active."}
            )
        existing = AttendanceCheckin.objects.filter(
            member=member, check_out_time__isnull=True
        ).first()
        if existing:
            raise serializers.ValidationError(
                {
                    "error": "Member is already checked in.",
                    "open_checkin_id": existing.pk,
                }
            )
        return attrs

    def save(self, **kwargs):
        member = self.validated_data["member"]
        source = self.validated_data.get("source", AttendanceCheckin.Source.DESK)
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        uid = getattr(user, "pk", None) if getattr(user, "is_authenticated", False) else None
        with transaction.atomic():
            locked = Member.objects.select_for_update().get(pk=member.pk)
            if not member_may_check_in_for_attendance(locked):
                raise serializers.ValidationError(
                    {"error": "Cannot check in. Membership is not active."}
                )
            open_row = AttendanceCheckin.objects.filter(
                member=locked, check_out_time__isnull=True
            ).first()
            if open_row:
                raise serializers.ValidationError(
                    {
                        "error": "Member is already checked in.",
                        "open_checkin_id": open_row.pk,
                    }
                )
            return AttendanceCheckin.objects.create(
                member=locked,
                source=source,
                recorded_by_id=uid,
            )


class QuickCheckoutSerializer(serializers.Serializer):
    member = serializers.PrimaryKeyRelatedField(
        queryset=Member.objects.all(), required=False, allow_null=False
    )
    id_number = serializers.CharField(required=False, allow_blank=True)
    search = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        _quick_resolve_member(attrs)
        member = attrs["member"]
        session = (
            AttendanceCheckin.objects.filter(member=member, check_out_time__isnull=True)
            .order_by("-check_in_time")
            .first()
        )
        if not session:
            raise serializers.ValidationError(
                {"error": "This member is not currently checked in."}
            )
        attrs["session"] = session
        return attrs

    def save(self, **kwargs):
        session = self.validated_data["session"]
        with transaction.atomic():
            locked = AttendanceCheckin.objects.select_for_update().get(pk=session.pk)
            if locked.check_out_time is not None:
                raise serializers.ValidationError(
                    {"error": "This member is not currently checked in."}
                )
            locked.check_out_time = timezone.now()
            locked.save(update_fields=["check_out_time"])
            return locked


class GymSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = GymSetting
        fields = (
            "gym_name",
            "logo_url",
            "currency",
            "admin_display_name",
            "updated_at",
        )
        read_only_fields = ("updated_at",)
