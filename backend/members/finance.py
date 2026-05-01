from decimal import Decimal

from django.db.models import Sum

from .models import MemberCharge, Payment

_BILLABLE_STATUSES = (
    MemberCharge.Status.UNPAID,
    MemberCharge.Status.PARTIALLY_PAID,
    MemberCharge.Status.PAID,
)
_OUTSTANDING_STATUSES = (
    MemberCharge.Status.UNPAID,
    MemberCharge.Status.PARTIALLY_PAID,
)


def member_financial_summary(member_id: int) -> dict[str, Decimal | str]:
    total_paid = (
        Payment.objects.filter(member_id=member_id, status=Payment.Status.PAID).aggregate(
            total=Sum("amount")
        )["total"]
        or Decimal("0.00")
    )
    total_charged = (
        MemberCharge.objects.filter(member_id=member_id, status__in=_BILLABLE_STATUSES).aggregate(
            total=Sum("amount")
        )["total"]
        or Decimal("0.00")
    )
    outstanding_amount = (
        MemberCharge.objects.filter(member_id=member_id, status__in=_OUTSTANDING_STATUSES).aggregate(
            total=Sum("amount")
        )["total"]
        or Decimal("0.00")
    )
    # Open charges only; excludes settled (paid/waived) charges without requiring a ledger payment row.
    account_balance = total_paid - outstanding_amount
    if account_balance > 0:
        balance_status = "credit"
    elif account_balance < 0:
        balance_status = "owes"
    else:
        balance_status = "settled"
    return {
        "total_paid": total_paid,
        "total_charged": total_charged,
        "outstanding_amount": outstanding_amount,
        "account_balance": account_balance,
        "balance_status": balance_status,
    }
