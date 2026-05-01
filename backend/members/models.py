from django.db import models
from django.utils import timezone


class RecordedMemberPaymentStatus(models.TextChoices):
    """Whether enrollment fees are considered paid (separate from Payment ledger rows)."""

    PENDING = "pending", "Pending"
    PAID = "paid", "Paid"


class Member(models.Model):
    class Plan(models.TextChoices):
        MONTHLY = "monthly", "Monthly"
        QUARTERLY = "quarterly", "Quarterly"
        YEARLY = "yearly", "Yearly"
        STUDENT = "student", "Student"
        FAMILY = "family", "Family"
        CUSTOM = "custom", "Custom"

    id_number = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        blank=True,
        null=True,
        help_text="Set automatically as M + zero-padded primary key (e.g. M000042).",
    )
    first_name = models.CharField(max_length=100, db_index=True)
    last_name = models.CharField(max_length=100, blank=True, default="", db_index=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(
        max_length=16,
        db_index=True,
        blank=True,
        help_text="Lebanon E.164: +961 and 8 digits, e.g. +96131234567",
    )
    plan = models.CharField(max_length=20, choices=Plan.choices)
    custom_plan_name = models.CharField(max_length=120, blank=True, default="")
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    member_payment_status = models.CharField(
        max_length=20,
        choices=RecordedMemberPaymentStatus.choices,
        default=RecordedMemberPaymentStatus.PENDING,
        db_index=True,
        help_text="Recorded payment status for this membership (enrollment / dues).",
    )
    # When money was collected (e.g. today) while start_date is when access begins (can be later)
    payment_received_on = models.DateField(
        null=True,
        blank=True,
        help_text="Date payment was received. Can differ from membership start (e.g. pay today, start next week).",
    )
    start_date = models.DateField()
    end_date = models.DateField(db_index=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def _assign_id_number(self):
        if self.pk and (not self.id_number or not str(self.id_number).strip()):
            self.id_number = f"M{int(self.pk):06d}"
            return True
        return False

    def save(self, *args, **kwargs):
        if self._state.adding:
            self.id_number = None
        super().save(*args, **kwargs)
        if self._assign_id_number():
            super().save(update_fields=["id_number", "updated_at"])

    def display_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip() or self.first_name

    def __str__(self):
        if self.id_number:
            return f"{self.display_name()} ({self.id_number})"
        return f"{self.display_name()} (pending id)"


class Payment(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"
        OVERDUE = "overdue", "Overdue"

    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        TRANSFER = "transfer", "Bank transfer"
        ONLINE = "online", "Online"

    member = models.ForeignKey(
        Member,
        on_delete=models.CASCADE,
        related_name="payments",
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    method = models.CharField(
        max_length=20,
        choices=Method.choices,
        default=Method.CASH,
    )
    due_date = models.DateField(null=True, blank=True, db_index=True)
    invoice_number = models.CharField(max_length=64, blank=True, default="")
    description = models.CharField(max_length=255, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["member", "status"]),
            models.Index(fields=["member", "due_date"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["invoice_number"],
                condition=~models.Q(invoice_number=""),
                name="uniq_payment_invoice_number_non_empty",
            )
        ]

    def __str__(self):
        return f"{self.member_id} {self.amount} {self.status}"

    @classmethod
    def generate_invoice_number(cls, day=None) -> str:
        use_day = day or timezone.localdate()
        prefix = f"INV-{use_day:%Y%m%d}-"
        latest = (
            cls.objects.filter(invoice_number__startswith=prefix)
            .order_by("-invoice_number")
            .values_list("invoice_number", flat=True)
            .first()
        )
        sequence = 0
        if latest and latest.startswith(prefix):
            suffix = latest[len(prefix) :]
            if suffix.isdigit():
                sequence = int(suffix)
        return f"{prefix}{sequence + 1:04d}"


class MemberNote(models.Model):
    member = models.ForeignKey(
        Member,
        on_delete=models.CASCADE,
        related_name="notes",
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]


class MembershipHistory(models.Model):
    class Event(models.TextChoices):
        CREATED = "created", "Created"
        UPDATED = "updated", "Updated"
        ASSIGNED = "assigned", "Assigned"
        RENEWED = "renewed", "Renewed"

    member = models.ForeignKey(
        Member,
        on_delete=models.CASCADE,
        related_name="membership_history",
    )
    event = models.CharField(max_length=20, choices=Event.choices, default=Event.UPDATED)
    plan = models.CharField(max_length=20, choices=Member.Plan.choices)
    start_date = models.DateField()
    end_date = models.DateField()
    payment_status = models.CharField(
        max_length=20,
        choices=RecordedMemberPaymentStatus.choices,
        default=RecordedMemberPaymentStatus.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class AttendanceCheckin(models.Model):
    class Source(models.TextChoices):
        DESK = "desk", "Front desk"
        STAFF = "staff", "Staff"
        SELF = "self", "Self-service"

    member = models.ForeignKey(
        Member,
        on_delete=models.CASCADE,
        related_name="checkins",
    )
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.DESK)
    checked_in_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-checked_in_at"]
        indexes = [
            models.Index(fields=["member", "checked_in_at"]),
        ]


class GymSetting(models.Model):
    gym_name = models.CharField(max_length=120, default="Gym Admin")
    logo_url = models.URLField(blank=True)
    currency = models.CharField(max_length=8, default="USD")
    admin_display_name = models.CharField(max_length=100, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)
