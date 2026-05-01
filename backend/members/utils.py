from dateutil.relativedelta import relativedelta
from django.utils import timezone

from .models import Member, RecordedMemberPaymentStatus


def end_date_for_plan(start_date, plan: str):
    if plan == Member.Plan.MONTHLY:
        return start_date + relativedelta(months=1)
    if plan == Member.Plan.QUARTERLY:
        return start_date + relativedelta(months=3)
    if plan == Member.Plan.YEARLY:
        return start_date + relativedelta(years=1)
    if plan == Member.Plan.STUDENT:
        return start_date + relativedelta(months=1)
    if plan == Member.Plan.FAMILY:
        return start_date + relativedelta(months=1)
    if plan == Member.Plan.CUSTOM:
        return start_date + relativedelta(months=1)
    raise ValueError(f"Unknown plan: {plan}")


def renew_membership(member: Member, plan: str | None = None) -> Member:
    """Extend membership: from current end if still active, else from today."""
    plan = plan or member.plan
    today = timezone.localdate()
    if member.end_date >= today:
        member.end_date = end_date_for_plan(member.end_date, plan)
    else:
        member.start_date = today
        member.end_date = end_date_for_plan(today, plan)
    member.plan = plan
    member.save()
    return member


def attendance_membership_status(member: Member) -> str:
    """Mirrors MemberSerializer membership_status: active | expired | not_active."""
    today = timezone.localdate()
    if member.member_payment_status != RecordedMemberPaymentStatus.PAID:
        return "not_active"
    if member.end_date >= today:
        return "active"
    return "expired"


def member_may_check_in_for_attendance(member: Member) -> bool:
    return attendance_membership_status(member) == "active"
