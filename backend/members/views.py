from datetime import timedelta

from django.db.models import Count, OuterRef, Q, Subquery, Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Member, Payment
from .serializers import (
    AdminTokenObtainPairSerializer,
    AssignMembershipSerializer,
    MemberSerializer,
    MemberWriteSerializer,
    PaymentSerializer,
    PaymentUpdateSerializer,
    PaymentWriteSerializer,
    RenewMembershipSerializer,
)


class AdminTokenObtainPairView(TokenObtainPairView):
    serializer_class = AdminTokenObtainPairSerializer


def _annotate_member_payment_fields(qs):
    latest_sq = (
        Payment.objects.filter(member=OuterRef("pk"))
        .order_by("-created_at")
        .values("status")[:1]
    )
    return qs.annotate(
        latest_payment_status=Subquery(latest_sq),
        _payment_count=Count("payments"),
    )


def _member_for_response(pk, context):
    inst = _annotate_member_payment_fields(Member.objects.filter(pk=pk)).first()
    return MemberSerializer(inst, context=context).data


class MemberViewSet(viewsets.ModelViewSet):
    """Administrator-only CRUD, search, filters, renew, assign membership."""

    queryset = Member.objects.all()
    permission_classes = [IsAdminUser]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return MemberWriteSerializer
        return MemberSerializer

    def get_queryset(self):
        qs = Member.objects.all()
        qs = _annotate_member_payment_fields(qs)

        search = (self.request.query_params.get("search") or "").strip()
        membership_status = self.request.query_params.get("status")
        plan = self.request.query_params.get("plan")
        payment_status = self.request.query_params.get("payment_status")
        today = timezone.localdate()

        if search:
            qs = qs.filter(
                Q(full_name__icontains=search) | Q(id_number__icontains=search)
            )

        if membership_status == "active":
            qs = qs.filter(end_date__gte=today)
        elif membership_status == "expired":
            qs = qs.filter(end_date__lt=today)

        if plan in (Member.Plan.MONTHLY, Member.Plan.QUARTERLY, Member.Plan.YEARLY):
            qs = qs.filter(plan=plan)

        if payment_status == "none":
            qs = qs.filter(_payment_count=0)
        elif payment_status in (
            Payment.Status.PENDING,
            Payment.Status.PAID,
            Payment.Status.FAILED,
        ):
            qs = qs.filter(
                _payment_count__gt=0, latest_payment_status=payment_status
            )

        return qs

    def create(self, request, *args, **kwargs):
        write = MemberWriteSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        self.perform_create(write)
        data = _member_for_response(write.instance.pk, self.get_serializer_context())
        headers = self.get_success_headers(data)
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        data = _member_for_response(instance.pk, self.get_serializer_context())
        return Response(data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        write = MemberWriteSerializer(
            instance, data=request.data, partial=partial
        )
        write.is_valid(raise_exception=True)
        self.perform_update(write)
        data = _member_for_response(write.instance.pk, self.get_serializer_context())
        return Response(data)

    @action(detail=True, methods=["post"], url_path="renew")
    def renew(self, request, pk=None):
        member = self.get_object()
        ser = RenewMembershipSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(member=member)
        data = _member_for_response(member.pk, self.get_serializer_context())
        return Response(data)

    @action(detail=True, methods=["post"], url_path="assign-membership")
    def assign_membership(self, request, pk=None):
        member = self.get_object()
        ser = AssignMembershipSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(member=member)
        data = _member_for_response(member.pk, self.get_serializer_context())
        return Response(data)


class PaymentViewSet(viewsets.ModelViewSet):
    """Record and list payments (admin only)."""

    queryset = Payment.objects.select_related("member").all()
    permission_classes = [IsAdminUser]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return PaymentWriteSerializer
        if self.action in ("partial_update", "update"):
            return PaymentUpdateSerializer
        return PaymentSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        member_id = self.request.query_params.get("member")
        st = self.request.query_params.get("status")
        if member_id:
            qs = qs.filter(member_id=member_id)
        if st in (
            Payment.Status.PENDING,
            Payment.Status.PAID,
            Payment.Status.FAILED,
        ):
            qs = qs.filter(status=st)
        return qs

    def create(self, request, *args, **kwargs):
        ser = PaymentWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        payment = ser.save()
        out = PaymentSerializer(
            payment, context=self.get_serializer_context()
        )
        return Response(out.data, status=status.HTTP_201_CREATED)


class DashboardView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        today = timezone.localdate()
        members = Member.objects.all()
        total_members = members.count()
        active_memberships = members.filter(end_date__gte=today).count()
        expired_memberships = members.filter(end_date__lt=today).count()

        paid_agg = Payment.objects.filter(status=Payment.Status.PAID).aggregate(
            total=Sum("amount")
        )
        total_revenue = paid_agg["total"] or 0

        horizon = request.query_params.get("expiring_days", "30")
        try:
            days = int(horizon)
        except ValueError:
            days = 30
        until = today + timedelta(days=days)
        expiring = (
            members.filter(end_date__gte=today, end_date__lte=until)
            .order_by("end_date")[:50]
        )
        expiring_data = MemberSerializer(
            _annotate_member_payment_fields(expiring), many=True
        ).data

        return Response(
            {
                "total_members": total_members,
                "active_memberships": active_memberships,
                "expired_memberships": expired_memberships,
                "total_revenue": str(total_revenue),
                "expiring_memberships": expiring_data,
                "expiring_days": days,
            }
        )
