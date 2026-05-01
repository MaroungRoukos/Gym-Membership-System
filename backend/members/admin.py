from django.contrib import admin

from .models import (
    AttendanceCheckin,
    GymSetting,
    Member,
    MemberNote,
    MembershipHistory,
    Payment,
)


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    readonly_fields = ("created_at", "paid_at")


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = (
        "id_number",
        "first_name",
        "last_name",
        "plan",
        "member_payment_status",
        "payment_received_on",
        "start_date",
        "end_date",
        "created_at",
    )
    list_filter = ("plan", "member_payment_status")
    search_fields = ("id_number", "first_name", "last_name", "email", "phone")
    readonly_fields = ("id_number",)
    inlines = [PaymentInline]


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "member",
        "amount",
        "status",
        "paid_at",
        "created_at",
    )
    list_filter = ("status",)
    search_fields = (
        "member__id_number",
        "member__first_name",
        "member__last_name",
        "notes",
    )


@admin.register(MemberNote)
class MemberNoteAdmin(admin.ModelAdmin):
    list_display = ("member", "created_at")
    search_fields = ("member__id_number", "member__first_name", "member__last_name", "body")


@admin.register(MembershipHistory)
class MembershipHistoryAdmin(admin.ModelAdmin):
    list_display = ("member", "event", "plan", "start_date", "end_date", "created_at")
    list_filter = ("event", "plan", "payment_status")
    search_fields = ("member__id_number", "member__first_name", "member__last_name")


@admin.register(AttendanceCheckin)
class AttendanceCheckinAdmin(admin.ModelAdmin):
    list_display = ("member", "source", "checked_in_at")
    list_filter = ("source",)
    search_fields = ("member__id_number", "member__first_name", "member__last_name")


@admin.register(GymSetting)
class GymSettingAdmin(admin.ModelAdmin):
    list_display = ("gym_name", "currency", "admin_display_name", "updated_at")
