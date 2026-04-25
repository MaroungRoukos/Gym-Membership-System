from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenBlacklistView, TokenRefreshView

from config.views import root
from members.views import AdminTokenObtainPairView

urlpatterns = [
    path("", root, name="root"),
    path("admin/", admin.site.urls),
    path("api/auth/login/", AdminTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/logout/", TokenBlacklistView.as_view(), name="token_blacklist"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/", include("members.urls")),
]
