import random
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone
from faker import Faker

from members.models import (
    AttendanceCheckin,
    Member,
    MemberNote,
    Payment,
    RecordedMemberPaymentStatus,
)


class Command(BaseCommand):
    help = "Seed a small development dataset (~10 members)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing members before seeding.",
        )

    def handle(self, *args, **options):
        fake = Faker()
        Faker.seed(42)
        random.seed(42)

        today = timezone.localdate()
        created = {"members": 0, "payments": 0, "checkins": 0, "notes": 0}
        skipped = {"members": 0, "payments": 0, "checkins": 0, "notes": 0}

        if options["clear"]:
            deleted_count, _ = Member.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Cleared existing records: {deleted_count}"))

        templates = [
            {"code": "SD0001", "status": "active", "plan": Member.Plan.MONTHLY, "days_to_end": 20, "pay_status": RecordedMemberPaymentStatus.PAID},
            {"code": "SD0002", "status": "active", "plan": Member.Plan.YEARLY, "days_to_end": 180, "pay_status": RecordedMemberPaymentStatus.PAID},
            {"code": "SD0003", "status": "expiring", "plan": Member.Plan.MONTHLY, "days_to_end": 6, "pay_status": RecordedMemberPaymentStatus.PAID},
            {"code": "SD0004", "status": "expiring", "plan": Member.Plan.STUDENT, "days_to_end": 2, "pay_status": RecordedMemberPaymentStatus.PAID},
            {"code": "SD0005", "status": "expired", "plan": Member.Plan.MONTHLY, "days_to_end": -12, "pay_status": RecordedMemberPaymentStatus.PAID},
            {"code": "SD0006", "status": "expired", "plan": Member.Plan.CUSTOM, "days_to_end": -35, "pay_status": RecordedMemberPaymentStatus.PAID},
            {"code": "SD0007", "status": "unpaid", "plan": Member.Plan.MONTHLY, "days_to_end": 15, "pay_status": RecordedMemberPaymentStatus.PENDING},
            {"code": "SD0008", "status": "unpaid", "plan": Member.Plan.CUSTOM, "days_to_end": 30, "pay_status": RecordedMemberPaymentStatus.PENDING},
            {"code": "SD0009", "status": "active", "plan": Member.Plan.STUDENT, "days_to_end": 45, "pay_status": RecordedMemberPaymentStatus.PAID},
            {"code": "SD0010", "status": "active", "plan": Member.Plan.YEARLY, "days_to_end": 250, "pay_status": RecordedMemberPaymentStatus.PAID},
        ]

        for i, tpl in enumerate(templates, start=1):
            start_date = today - timedelta(days=random.randint(20, 90))
            end_date = today + timedelta(days=tpl["days_to_end"])
            first = fake.first_name()
            last = fake.last_name()
            email = f"seed{i}@example.com"
            phone = f"+9613{100000 + i}"
            custom_plan_name = "Power Plan" if tpl["plan"] == Member.Plan.CUSTOM else ""
            discount = Decimal("10.00") if tpl["plan"] == Member.Plan.CUSTOM else Decimal("0.00")

            member, member_created = Member.objects.get_or_create(
                email=email,
                defaults={
                    "first_name": first,
                    "last_name": last,
                    "phone": phone,
                    "plan": tpl["plan"],
                    "custom_plan_name": custom_plan_name,
                    "discount_percent": discount,
                    "member_payment_status": tpl["pay_status"],
                    "payment_received_on": today if tpl["pay_status"] == RecordedMemberPaymentStatus.PAID else None,
                    "start_date": start_date,
                    "end_date": end_date,
                },
            )

            if member_created:
                member.id_number = tpl["code"]
                member.save(update_fields=["id_number", "updated_at"])
                created["members"] += 1
            else:
                skipped["members"] += 1

            payment_count = random.randint(1, 3)
            for payment_idx in range(payment_count):
                payment_status = random.choice(
                    [Payment.Status.PAID, Payment.Status.PENDING, Payment.Status.OVERDUE]
                )
                amount = Decimal(str(random.choice([25, 35, 45, 60, 90, 120])))
                due_date = today - timedelta(days=random.randint(0, 45))
                paid_at = timezone.now() - timedelta(days=random.randint(1, 25)) if payment_status == Payment.Status.PAID else None

                invoice_number = f"{tpl['code']}-INV-{payment_idx + 1}"
                _, pay_created = Payment.objects.get_or_create(
                    member=member,
                    invoice_number=invoice_number,
                    defaults={
                        "amount": amount,
                        "status": payment_status,
                        "method": random.choice([Payment.Method.CASH, Payment.Method.CARD, Payment.Method.TRANSFER]),
                        "due_date": due_date,
                        "description": "Seed payment",
                        "paid_at": paid_at,
                    },
                )
                if pay_created:
                    created["payments"] += 1
                else:
                    skipped["payments"] += 1

            is_active = member.member_payment_status == RecordedMemberPaymentStatus.PAID and member.end_date >= today
            if is_active:
                for _ in range(random.randint(0, 10)):
                    day_offset = random.randint(0, 13)
                    checkin_date = today - timedelta(days=day_offset)
                    exists = AttendanceCheckin.objects.filter(
                        member=member,
                        checked_in_at__date=checkin_date,
                    ).exists()
                    if exists:
                        skipped["checkins"] += 1
                        continue
                    checkin = AttendanceCheckin.objects.create(
                        member=member,
                        source=random.choice([AttendanceCheckin.Source.DESK, AttendanceCheckin.Source.STAFF]),
                    )
                    checkin.checked_in_at = timezone.make_aware(
                        datetime.combine(
                            checkin_date,
                            time(hour=random.randint(6, 21), minute=random.randint(0, 59)),
                        )
                    )
                    checkin.save(update_fields=["checked_in_at"])
                    created["checkins"] += 1

            if random.random() < 0.5:
                note_body = fake.sentence(nb_words=10)
                _, note_created = MemberNote.objects.get_or_create(
                    member=member,
                    body=note_body,
                )
                if note_created:
                    created["notes"] += 1
                else:
                    skipped["notes"] += 1

        self.stdout.write(self.style.SUCCESS("Seed complete."))
        self.stdout.write(
            f"Inserted -> members: {created['members']}, payments: {created['payments']}, "
            f"checkins: {created['checkins']}, notes: {created['notes']}"
        )
        self.stdout.write(
            f"Skipped  -> members: {skipped['members']}, payments: {skipped['payments']}, "
            f"checkins: {skipped['checkins']}, notes: {skipped['notes']}"
        )
