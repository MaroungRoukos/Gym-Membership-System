from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AttendanceCheckinViewSet,
    DashboardView,
    GymSettingView,
    MemberNoteViewSet,
    MemberViewSet,
    MembershipHistoryViewSet,
    PaymentViewSet,
    ReportsView,
)

router = DefaultRouter()
router.register("members", MemberViewSet, basename="member")
router.register("payments", PaymentViewSet, basename="payment")
router.register("member-notes", MemberNoteViewSet, basename="member-note")
router.register("membership-history", MembershipHistoryViewSet, basename="membership-history")
router.register("checkins", AttendanceCheckinViewSet, basename="checkin")

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("reports/", ReportsView.as_view(), name="reports"),
    path("settings/", GymSettingView.as_view(), name="settings"),
    path("", include(router.urls)),
]
