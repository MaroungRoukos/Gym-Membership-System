from datetime import timedelta

from django.db.models import Count, OuterRef, Q, Subquery, Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import LimitOffsetPagination, PageNumberPagination
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import (
    AttendanceCheckin,
    GymSetting,
    Member,
    MemberNote,
    MembershipHistory,
    Payment,
    RecordedMemberPaymentStatus,
)
from .serializers import (
    AdminTokenObtainPairSerializer,
    AssignMembershipSerializer,
    AttendanceCheckinSerializer,
    GymSettingSerializer,
    MemberSerializer,
    MemberNoteSerializer,
    MemberWriteSerializer,
    MembershipHistorySerializer,
    PaymentSerializer,
    PaymentUpdateSerializer,
    PaymentWriteSerializer,
    QuickCheckinSerializer,
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


def _record_membership_history(member: Member, event: str):
    MembershipHistory.objects.create(
        member=member,
        event=event,
        plan=member.plan,
        start_date=member.start_date,
        end_date=member.end_date,
        payment_status=member.member_payment_status,
    )


def _apply_ordering(qs, requested, allowed, default):
    if requested:
        clean = [f.strip() for f in requested.split(",") if f.strip()]
        valid = []
        for field in clean:
            bare = field[1:] if field.startswith("-") else field
            if bare in allowed:
                valid.append(field)
        if valid:
            return qs.order_by(*valid)
    return qs.order_by(*default)


class OptionalPaginationMixin:
    """
    Keep existing list responses unchanged unless pagination query params are provided.
    Supports both page/page_size and limit/offset styles.
    """

    def paginate_queryset(self, queryset):
        params = self.request.query_params
        has_page_style = any(k in params for k in ("page", "page_size"))
        has_limit_style = any(k in params for k in ("limit", "offset"))

        if has_limit_style:
            paginator = LimitOffsetPagination()
            paginator.default_limit = 20
            paginator.max_limit = 100
            self._paginator = paginator
            return paginator.paginate_queryset(queryset, self.request, view=self)

        if has_page_style:
            paginator = PageNumberPagination()
            paginator.page_size = 20
            paginator.page_size_query_param = "page_size"
            paginator.max_page_size = 100
            self._paginator = paginator
            return paginator.paginate_queryset(queryset, self.request, view=self)

        self._paginator = None
        return None


class MemberViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
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
        phone = (self.request.query_params.get("phone") or "").strip()
        expiry_before = self.request.query_params.get("expiry_before")
        expiry_after = self.request.query_params.get("expiry_after")
        today = timezone.localdate()

        if search:
            qs = qs.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(id_number__icontains=search)
                | Q(phone__icontains=search)
            )
        if phone:
            qs = qs.filter(phone__icontains=phone)

        if membership_status == "active":
            qs = qs.filter(
                end_date__gte=today,
                member_payment_status=RecordedMemberPaymentStatus.PAID,
            )
        elif membership_status == "expired":
            qs = qs.exclude(
                end_date__gte=today,
                member_payment_status=RecordedMemberPaymentStatus.PAID,
            )
            qs = qs.filter(member_payment_status=RecordedMemberPaymentStatus.PAID)
        elif membership_status == "not_active":
            qs = qs.exclude(member_payment_status=RecordedMemberPaymentStatus.PAID)

        if plan in (Member.Plan.MONTHLY, Member.Plan.QUARTERLY, Member.Plan.YEARLY):
            qs = qs.filter(plan=plan)

        if payment_status == "none":
            qs = qs.filter(_payment_count=0)
        elif payment_status in (
            Payment.Status.PENDING,
            Payment.Status.PAID,
            Payment.Status.FAILED,
            Payment.Status.OVERDUE,
        ):
            qs = qs.filter(
                _payment_count__gt=0, latest_payment_status=payment_status
            )
        if expiry_before:
            qs = qs.filter(end_date__lte=expiry_before)
        if expiry_after:
            qs = qs.filter(end_date__gte=expiry_after)

        return _apply_ordering(
            qs,
            self.request.query_params.get("ordering"),
            {"created_at", "updated_at", "end_date", "start_date", "id_number", "first_name"},
            ("-created_at",),
        )

    def create(self, request, *args, **kwargs):
        write = MemberWriteSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        self.perform_create(write)
        _record_membership_history(write.instance, MembershipHistory.Event.CREATED)
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
        _record_membership_history(write.instance, MembershipHistory.Event.UPDATED)
        data = _member_for_response(write.instance.pk, self.get_serializer_context())
        return Response(data)

    @action(detail=True, methods=["post"], url_path="renew")
    def renew(self, request, pk=None):
        member = self.get_object()
        ser = RenewMembershipSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(member=member)
        _record_membership_history(member, MembershipHistory.Event.RENEWED)
        data = _member_for_response(member.pk, self.get_serializer_context())
        return Response(data)

    @action(detail=True, methods=["post"], url_path="assign-membership")
    def assign_membership(self, request, pk=None):
        member = self.get_object()
        ser = AssignMembershipSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(member=member)
        _record_membership_history(member, MembershipHistory.Event.ASSIGNED)
        data = _member_for_response(member.pk, self.get_serializer_context())
        return Response(data)

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        member = self.get_object()
        member.member_payment_status = RecordedMemberPaymentStatus.PAID
        if not member.payment_received_on:
            member.payment_received_on = timezone.localdate()
        member.save(update_fields=["member_payment_status", "payment_received_on", "updated_at"])
        _record_membership_history(member, MembershipHistory.Event.UPDATED)
        data = _member_for_response(member.pk, self.get_serializer_context())
        return Response(data)


class PaymentViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
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
            Payment.Status.OVERDUE,
        ):
            qs = qs.filter(status=st)
        return _apply_ordering(
            qs,
            self.request.query_params.get("ordering"),
            {"created_at", "updated_at", "due_date", "amount", "status"},
            ("-created_at",),
        )

    def create(self, request, *args, **kwargs):
        ser = PaymentWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        payment = ser.save()
        out = PaymentSerializer(
            payment, context=self.get_serializer_context()
        )
        return Response(out.data, status=status.HTTP_201_CREATED)


class MemberNoteViewSet(viewsets.ModelViewSet):
    queryset = MemberNote.objects.select_related("member").all()
    serializer_class = MemberNoteSerializer
    permission_classes = [IsAdminUser]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        member_id = self.request.query_params.get("member")
        if member_id:
            qs = qs.filter(member_id=member_id)
        return _apply_ordering(
            qs,
            self.request.query_params.get("ordering"),
            {"checked_in_at"},
            ("-checked_in_at",),
        )


class MembershipHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = MembershipHistory.objects.select_related("member").all()
    serializer_class = MembershipHistorySerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = super().get_queryset()
        member_id = self.request.query_params.get("member")
        if member_id:
            qs = qs.filter(member_id=member_id)
        return qs


class AttendanceCheckinViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    queryset = AttendanceCheckin.objects.select_related("member").all()
    serializer_class = AttendanceCheckinSerializer
    permission_classes = [IsAdminUser]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        member_id = self.request.query_params.get("member")
        if member_id:
            qs = qs.filter(member_id=member_id)
        return qs

    @action(detail=False, methods=["post"], url_path="quick")
    def quick(self, request):
        ser = QuickCheckinSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        checkin = ser.save()
        out = AttendanceCheckinSerializer(checkin, context=self.get_serializer_context())
        return Response(out.data, status=status.HTTP_201_CREATED)


class DashboardView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        today = timezone.localdate()
        members = Member.objects.all()
        total_members = members.count()
        active_memberships = members.filter(
            end_date__gte=today,
            member_payment_status=RecordedMemberPaymentStatus.PAID,
        ).count()
        expired_memberships = members.filter(
            end_date__lt=today,
            member_payment_status=RecordedMemberPaymentStatus.PAID,
        ).count()
        not_active_memberships = members.exclude(
            member_payment_status=RecordedMemberPaymentStatus.PAID
        ).count()

        paid_agg = Payment.objects.filter(status=Payment.Status.PAID).aggregate(
            total=Sum("amount")
        )
        total_revenue = paid_agg["total"] or 0

        month_start = today.replace(day=1)
        year_start = today.replace(month=1, day=1)
        monthly_revenue = (
            Payment.objects.filter(
                status=Payment.Status.PAID,
                created_at__date__gte=month_start,
            ).aggregate(total=Sum("amount"))["total"]
            or 0
        )
        yearly_revenue = (
            Payment.objects.filter(
                status=Payment.Status.PAID,
                created_at__date__gte=year_start,
            ).aggregate(total=Sum("amount"))["total"]
            or 0
        )
        new_members_this_month = members.filter(created_at__date__gte=month_start).count()
        unpaid_balance = (
            Payment.objects.filter(status__in=[Payment.Status.PENDING, Payment.Status.OVERDUE])
            .aggregate(total=Sum("amount"))["total"]
            or 0
        )

        horizon = request.query_params.get("expiring_days", "30")
        try:
            days = int(horizon)
        except ValueError:
            days = 30
        until = today + timedelta(days=days)
        expiring = (
            members.filter(
                end_date__gte=today,
                end_date__lte=until,
                member_payment_status=RecordedMemberPaymentStatus.PAID,
            )
            .order_by("end_date")[:50]
        )
        expiring_soon = expiring.count()
        expiring_data = MemberSerializer(
            _annotate_member_payment_fields(expiring), many=True
        ).data

        return Response(
            {
                "total_members": total_members,
                "active_memberships": active_memberships,
                "expired_memberships": expired_memberships,
                "not_active_memberships": not_active_memberships,
                "total_revenue": str(total_revenue),
                "monthly_revenue": str(monthly_revenue),
                "yearly_revenue": str(yearly_revenue),
                "new_members_this_month": new_members_this_month,
                "unpaid_balances": str(unpaid_balance),
                "expiring_soon": expiring_soon,
                "expiring_memberships": expiring_data,
                "expiring_days": days,
            }
        )


class ReportsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        today = timezone.localdate()
        months = []
        for i in range(5, -1, -1):
            anchor = (today.replace(day=1) - timedelta(days=32 * i)).replace(day=1)
            next_anchor = (anchor + timedelta(days=32)).replace(day=1)
            revenue = (
                Payment.objects.filter(
                    status=Payment.Status.PAID,
                    created_at__date__gte=anchor,
                    created_at__date__lt=next_anchor,
                ).aggregate(total=Sum("amount"))["total"]
                or 0
            )
            growth = Member.objects.filter(
                created_at__date__gte=anchor, created_at__date__lt=next_anchor
            ).count()
            months.append(
                {
                    "label": anchor.strftime("%b %Y"),
                    "revenue": float(revenue),
                    "new_members": growth,
                }
            )

        attendance = []
        for i in range(6, -1, -1):
            day = today - timedelta(days=i)
            attendance.append(
                {
                    "label": day.strftime("%a"),
                    "checkins": AttendanceCheckin.objects.filter(
                        checked_in_at__date=day
                    ).count(),
                }
            )

        return Response(
            {
                "monthly_revenue": months,
                "attendance_week": attendance,
                "expired_members_count": Member.objects.filter(
                    end_date__lt=today,
                    member_payment_status=RecordedMemberPaymentStatus.PAID,
                ).count(),
            }
        )


class GymSettingView(APIView):
    permission_classes = [IsAdminUser]

    def get_object(self):
        return GymSetting.objects.get_or_create(pk=1)[0]

    def get(self, request):
        obj = self.get_object()
        return Response(GymSettingSerializer(obj).data)

    def patch(self, request):
        obj = self.get_object()
        ser = GymSettingSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)
