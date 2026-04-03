from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Member, Payment
from .utils import end_date_for_plan


class AdminTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        if not self.user.is_staff:
            raise serializers.ValidationError(
                {"detail": "Only administrator accounts can sign in."}
            )
        return data


class MemberSerializer(serializers.ModelSerializer):
    membership_status = serializers.SerializerMethodField(read_only=True)
    latest_payment_status = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Member
        fields = (
            "id",
            "id_number",
            "full_name",
            "email",
            "phone",
            "plan",
            "start_date",
            "end_date",
            "membership_status",
            "latest_payment_status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def get_membership_status(self, obj):
        today = timezone.localdate()
        return "active" if obj.end_date >= today else "expired"

    def get_latest_payment_status(self, obj):
        if hasattr(obj, "latest_payment_status"):
            return obj.latest_payment_status
        p = obj.payments.order_by("-created_at").first()
        return p.status if p else None


class MemberWriteSerializer(serializers.ModelSerializer):
    """If end_date is omitted or null, it is set from start_date and plan."""

    end_date = serializers.DateField(required=False, allow_null=True)

    class Meta:
        model = Member
        fields = (
            "id_number",
            "full_name",
            "email",
            "phone",
            "plan",
            "start_date",
            "end_date",
        )

    def validate(self, attrs):
        instance = self.instance
        start = attrs.get("start_date", getattr(instance, "start_date", None))
        plan = attrs.get("plan", getattr(instance, "plan", None))

        recompute = False
        if not instance:
            recompute = "end_date" not in attrs or attrs.get("end_date") is None
        else:
            if "end_date" in attrs and attrs.get("end_date") is None:
                recompute = True
            elif ("start_date" in attrs or "plan" in attrs) and "end_date" not in attrs:
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
    member_name = serializers.CharField(source="member.full_name", read_only=True)
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
            "description",
            "paid_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at", "paid_at")


class PaymentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ("member", "amount", "status", "description")

    def create(self, validated_data):
        status = validated_data.get("status", Payment.Status.PENDING)
        paid_at = None
        if status == Payment.Status.PAID:
            paid_at = timezone.now()
        return Payment.objects.create(paid_at=paid_at, **validated_data)


class PaymentUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ("amount", "status", "description")

    def update(self, instance, validated_data):
        new_status = validated_data.get("status", instance.status)
        if new_status == Payment.Status.PAID and not instance.paid_at:
            instance.paid_at = timezone.now()
        return super().update(instance, validated_data)
