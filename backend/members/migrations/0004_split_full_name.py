# Split Member.full_name into first_name and last_name; align phone field length

from django.db import migrations, models


def copy_full_name_to_first_last(apps, schema_editor):
    Member = apps.get_model("members", "Member")
    for m in Member.objects.all():
        raw = (getattr(m, "full_name", None) or "").strip()
        if raw:
            parts = raw.split(None, 1)
            m.first_name = (parts[0] or "Member")[:100]
            m.last_name = (parts[1] if len(parts) > 1 else "")[:100]
        else:
            m.first_name = "Member"
            m.last_name = ""
        m.save(update_fields=["first_name", "last_name"])


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("members", "0003_auto_id_number"),
    ]

    operations = [
        migrations.AddField(
            model_name="member",
            name="first_name",
            field=models.CharField(default="", max_length=100),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="member",
            name="last_name",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.RunPython(copy_full_name_to_first_last, reverse_noop),
        migrations.RemoveField(
            model_name="member",
            name="full_name",
        ),
        migrations.AlterField(
            model_name="member",
            name="first_name",
            field=models.CharField(max_length=100),
        ),
        migrations.AlterField(
            model_name="member",
            name="phone",
            field=models.CharField(
                blank=True,
                help_text="Lebanon E.164: +961 and 8 digits, e.g. +96131234567",
                max_length=16,
            ),
        ),
    ]
