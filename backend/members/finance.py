from decimal import Decimal

from django.db.models import Sum

from .models import Payment


def member_financial_summary(member_id: int) -> dict[str, Decimal]:
    paid_statuses = [Payment.Status.PAID]
    # There is no dedicated Charge model yet; treat pending/overdue ledger rows as outstanding charges.
    charged_statuses = [Payment.Status.PENDING, Payment.Status.OVERDUE]
    outstanding_statuses = [Payment.Status.PENDING, Payment.Status.OVERDUE]

    total_paid = (
        Payment.objects.filter(member_id=member_id, status__in=paid_statuses).aggregate(
            total=Sum("amount")
        )["total"]
        or Decimal("0")
    )
    total_charged = (
        Payment.objects.filter(member_id=member_id, status__in=charged_statuses).aggregate(
            total=Sum("amount")
        )["total"]
        or Decimal("0")
    )
    outstanding_amount = (
        Payment.objects.filter(member_id=member_id, status__in=outstanding_statuses).aggregate(
            total=Sum("amount")
        )["total"]
        or Decimal("0")
    )
    account_balance = total_paid - total_charged
    return {
        "total_paid": total_paid,
        "total_charged": total_charged,
        "outstanding_amount": outstanding_amount,
        "account_balance": account_balance,
    }
