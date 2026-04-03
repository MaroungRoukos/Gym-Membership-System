from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DashboardView, MemberViewSet, PaymentViewSet

router = DefaultRouter()
router.register("members", MemberViewSet, basename="member")
router.register("payments", PaymentViewSet, basename="payment")

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("", include(router.urls)),
]
