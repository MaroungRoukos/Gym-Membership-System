from dateutil.relativedelta import relativedelta
from django.utils import timezone

from .models import Member


def end_date_for_plan(start_date, plan: str):
    if plan == Member.Plan.MONTHLY:
        return start_date + relativedelta(months=1)
    if plan == Member.Plan.QUARTERLY:
        return start_date + relativedelta(months=3)
    if plan == Member.Plan.YEARLY:
        return start_date + relativedelta(years=1)
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
