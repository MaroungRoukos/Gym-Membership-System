from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("members", "0010_alter_member_created_at_alter_member_first_name_and_more"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="payment",
            constraint=models.UniqueConstraint(
                condition=~models.Q(invoice_number=""),
                fields=("invoice_number",),
                name="uniq_payment_invoice_number_non_empty",
            ),
        ),
    ]
