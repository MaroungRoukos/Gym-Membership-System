from django.contrib import admin

from .models import Member, Payment


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    readonly_fields = ("created_at", "paid_at")


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = (
        "id_number",
        "full_name",
        "plan",
        "start_date",
        "end_date",
        "created_at",
    )
    list_filter = ("plan",)
    search_fields = ("id_number", "full_name", "email", "phone")
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
    search_fields = ("member__id_number", "member__full_name", "description")
