# Generated manually for Gym configuration defaults

from django.db import migrations, models


def default_checkin_sources():
    return ["Desk", "Staff", "QR", "Kiosk"]


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0014_attendance_checkout_and_recorded_by"),
    ]

    operations = [
        migrations.AddField(
            model_name="gymsetting",
            name="timezone",
            field=models.CharField(
                default="UTC",
                help_text="IANA timezone name (e.g. America/New_York).",
                max_length=64,
            ),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="date_format",
            field=models.CharField(
                default="%Y-%m-%d",
                help_text='strftime-compatible pattern used for display (e.g. "%Y-%m-%d").',
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="registration_fee",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="default_payment_due_days",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="invoice_prefix",
            field=models.CharField(default="INV", max_length=32),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="allow_credit_balance",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="allow_outstanding_balance",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="tax_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="tax_rate",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=5),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="default_membership_duration_days",
            field=models.PositiveIntegerField(default=30),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="grace_period_days",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="block_checkin_when_expired",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="allow_renewal_with_outstanding_balance",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="require_payment_before_renewal",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="require_checkout",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="auto_checkout_hours",
            field=models.PositiveIntegerField(default=12),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="allow_duplicate_checkin_same_day",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="gymsetting",
            name="checkin_sources",
            field=models.JSONField(default=default_checkin_sources),
        ),
    ]
