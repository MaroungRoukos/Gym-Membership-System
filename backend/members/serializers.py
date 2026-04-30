from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import (
    AttendanceCheckin,
    GymSetting,
    Member,
    MemberNote,
    MembershipHistory,
    Payment,
    RecordedMemberPaymentStatus,
)
from .utils import end_date_for_plan
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

    class Meta:
        model = Payment
        fields = (
            "id",
            "member",
            "member_name",
            "member_id_number",
            "amount",
            "status",
            "method",
            "due_date",
            "invoice_number",
            "description",
            "paid_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at", "paid_at")

    def get_member_name(self, obj):
        return obj.member.display_name()


class PaymentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = (
            "member",
            "amount",
            "status",
            "method",
            "due_date",
            "invoice_number",
            "description",
        )

    def create(self, validated_data):
        status = validated_data.get("status", Payment.Status.PENDING)
        paid_at = None
        if status == Payment.Status.PAID:
            paid_at = timezone.now()
        return Payment.objects.create(paid_at=paid_at, **validated_data)


class PaymentUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ("amount", "status", "method", "due_date", "invoice_number", "description")

    def update(self, instance, validated_data):
        new_status = validated_data.get("status", instance.status)
        if new_status == Payment.Status.PAID and not instance.paid_at:
            instance.paid_at = timezone.now()
        return super().update(instance, validated_data)


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

    class Meta:
        model = AttendanceCheckin
        fields = (
            "id",
            "member",
            "member_name",
            "member_id_number",
            "source",
            "checked_in_at",
        )
        read_only_fields = ("checked_in_at",)

    def get_member_name(self, obj):
        return obj.member.display_name()


class QuickCheckinSerializer(serializers.Serializer):
    id_number = serializers.CharField(required=False, allow_blank=True)
    search = serializers.CharField(required=False, allow_blank=True)
    source = serializers.ChoiceField(
        required=False,
        choices=AttendanceCheckin.Source.choices,
        default=AttendanceCheckin.Source.DESK,
    )

    def validate(self, attrs):
        id_number = (attrs.get("id_number") or "").strip()
        search = (attrs.get("search") or "").strip()
        if not id_number and not search:
            raise serializers.ValidationError(
                {"detail": "Provide id_number or search to check in a member."}
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
            raise serializers.ValidationError({"detail": "Member not found."})
        attrs["member"] = member
        return attrs

    def save(self, **kwargs):
        member = self.validated_data["member"]
        source = self.validated_data.get("source", AttendanceCheckin.Source.DESK)
        return AttendanceCheckin.objects.create(member=member, source=source)


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
