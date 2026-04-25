from django.db import models


class RecordedMemberPaymentStatus(models.TextChoices):
    """Whether enrollment fees are considered paid (separate from Payment ledger rows)."""

    PENDING = "pending", "Pending"
    PAID = "paid", "Paid"


class Member(models.Model):
    class Plan(models.TextChoices):
        MONTHLY = "monthly", "Monthly"
        QUARTERLY = "quarterly", "Quarterly"
        YEARLY = "yearly", "Yearly"

    id_number = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        blank=True,
        null=True,
        help_text="Set automatically as M + zero-padded primary key (e.g. M000042).",
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True, default="")
    email = models.EmailField(blank=True)
    phone = models.CharField(
        max_length=16,
        blank=True,
        help_text="Lebanon E.164: +961 and 8 digits, e.g. +96131234567",
    )
    plan = models.CharField(max_length=20, choices=Plan.choices)
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
    end_date = models.DateField()

    created_at = models.DateTimeField(auto_now_add=True)
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
    )
    description = models.CharField(max_length=255, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.member_id} {self.amount} {self.status}"
