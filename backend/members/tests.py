from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .finance import member_financial_summary
from .models import (
    AttendanceCheckin,
    Member,
    MemberCharge,
    Payment,
    RecordedMemberPaymentStatus,
)


def _as_decimal(value) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _api_detail_value(data: dict, key: str):
    """DRF may wrap serializer ValidationError values in single-element lists."""
    v = data.get(key)
    if isinstance(v, list) and v:
        v = v[0]
    return v


class BaseAPITestCase(APITestCase):
    def setUp(self):
        self.user_model = get_user_model()
        self.admin = self.user_model.objects.create_user(
            username="admin",
            password="admin-pass-123",
            is_staff=True,
        )
        self.non_staff = self.user_model.objects.create_user(
            username="viewer",
            password="viewer-pass-123",
            is_staff=False,
        )

    def authenticate_admin(self):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "admin", "password": "admin-pass-123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return response.data

    def create_member(self, suffix: int) -> Member:
        today = timezone.localdate()
        return Member.objects.create(
            first_name=f"Member{suffix}",
            last_name="Test",
            email=f"member{suffix}@example.com",
            phone=f"+9613111{suffix:04d}",
            plan=Member.Plan.MONTHLY,
            member_payment_status=RecordedMemberPaymentStatus.PAID,
            start_date=today - timedelta(days=3),
            end_date=today + timedelta(days=27),
        )


class AuthApiTests(BaseAPITestCase):
    def test_staff_can_login_and_refresh_and_logout(self):
        login_response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "admin", "password": "admin-pass-123"},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        self.assertIn("access", login_response.data)
        self.assertIn("refresh", login_response.data)

        refresh_response = self.client.post(
            reverse("token_refresh"),
            {"refresh": login_response.data["refresh"]},
            format="json",
        )
        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)
        self.assertIn("access", refresh_response.data)

        logout_response = self.client.post(
            reverse("token_blacklist"),
            {"refresh": login_response.data["refresh"]},
            format="json",
        )
        self.assertEqual(logout_response.status_code, status.HTTP_200_OK)

    def test_non_staff_cannot_login(self):
        login_response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "viewer", "password": "viewer-pass-123"},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_400_BAD_REQUEST)


class MemberApiTests(BaseAPITestCase):
    def test_members_list_unpaginated_without_query_params(self):
        self.authenticate_admin()
        for i in range(3):
            self.create_member(i + 1)

        response = self.client.get("/api/members/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 3)

    def test_members_list_supports_page_number_pagination(self):
        self.authenticate_admin()
        for i in range(25):
            self.create_member(i + 1)

        response = self.client.get("/api/members/?page=1&page_size=10")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("count", response.data)
        self.assertIn("results", response.data)
        self.assertEqual(response.data["count"], 25)
        self.assertEqual(len(response.data["results"]), 10)

    def test_members_list_supports_limit_offset_pagination(self):
        self.authenticate_admin()
        for i in range(12):
            self.create_member(i + 1)

        response = self.client.get("/api/members/?limit=5&offset=5")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 12)
        self.assertEqual(len(response.data["results"]), 5)

    def test_members_filters_work_with_pagination(self):
        self.authenticate_admin()
        for i in range(5):
            member = self.create_member(i + 1)
            if i < 3:
                member.first_name = f"VIP{i + 1}"
                member.save(update_fields=["first_name", "updated_at"])

        response = self.client.get("/api/members/?search=VIP&limit=2&offset=0")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(len(response.data["results"]), 2)

    def test_members_support_ordering(self):
        self.authenticate_admin()
        today = timezone.localdate()
        member_a = self.create_member(10)
        member_b = self.create_member(11)
        member_c = self.create_member(12)
        member_a.end_date = today + timedelta(days=40)
        member_b.end_date = today + timedelta(days=10)
        member_c.end_date = today + timedelta(days=20)
        member_a.save(update_fields=["end_date", "updated_at"])
        member_b.save(update_fields=["end_date", "updated_at"])
        member_c.save(update_fields=["end_date", "updated_at"])

        response = self.client.get("/api/members/?ordering=end_date&limit=3&offset=0")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        dates = [item["end_date"] for item in response.data["results"]]
        self.assertEqual(dates, sorted(dates))

    def test_member_financial_summary_uses_only_paid_payments(self):
        self.authenticate_admin()
        member = self.create_member(20)
        Payment.objects.create(
            member=member,
            amount=Decimal("50.00"),
            status=Payment.Status.PAID,
            method=Payment.Method.CASH,
        )
        Payment.objects.create(
            member=member,
            amount=Decimal("999.00"),
            status=Payment.Status.PENDING,
            method=Payment.Method.CARD,
        )

        response = self.client.get(f"/api/members/{member.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(_as_decimal(response.data["total_paid"]), Decimal("50.00"))
        self.assertEqual(_as_decimal(response.data["total_charged"]), Decimal("0.00"))
        self.assertEqual(_as_decimal(response.data["outstanding_amount"]), Decimal("0.00"))
        self.assertEqual(_as_decimal(response.data["account_balance"]), Decimal("50.00"))
        self.assertEqual(response.data["balance_status"], "credit")

    def test_member_financial_summary_pending_only_stays_settled(self):
        self.authenticate_admin()
        member = self.create_member(21)
        Payment.objects.create(
            member=member,
            amount=Decimal("40.00"),
            status=Payment.Status.PENDING,
            method=Payment.Method.CASH,
        )

        response = self.client.get(f"/api/members/{member.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(_as_decimal(response.data["total_paid"]), Decimal("0.00"))
        self.assertEqual(_as_decimal(response.data["outstanding_amount"]), Decimal("0.00"))
        self.assertEqual(_as_decimal(response.data["account_balance"]), Decimal("0.00"))
        self.assertEqual(response.data["balance_status"], "settled")

    def test_renew_membership_allowed_with_pending_payment(self):
        self.authenticate_admin()
        member = self.create_member(22)
        previous_end = member.end_date
        Payment.objects.create(
            member=member,
            amount=Decimal("25.00"),
            status=Payment.Status.PENDING,
            method=Payment.Method.CASH,
        )

        response = self.client.post(f"/api/members/{member.id}/renew/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        member.refresh_from_db()
        self.assertGreater(member.end_date, previous_end)

    def test_member_financial_summary_function_returns_credit_for_paid_payment(self):
        member = self.create_member(23)
        Payment.objects.create(
            member=member,
            amount=Decimal("50.00"),
            status=Payment.Status.PAID,
            method=Payment.Method.CASH,
        )

        summary = member_financial_summary(member.id)
        self.assertEqual(summary["total_paid"], Decimal("50.00"))
        self.assertEqual(summary["account_balance"], Decimal("50.00"))
        self.assertEqual(summary["balance_status"], "credit")


class PaymentApiTests(BaseAPITestCase):
    def test_payments_list_supports_pagination(self):
        self.authenticate_admin()
        member = self.create_member(1)
        for i in range(8):
            Payment.objects.create(
                member=member,
                amount=Decimal("25.00"),
                status=Payment.Status.PENDING,
                method=Payment.Method.CASH,
                invoice_number=f"INV-{i}",
            )

        response = self.client.get("/api/payments/?limit=3&offset=0")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 8)
        self.assertEqual(len(response.data["results"]), 3)

    def test_payments_support_ordering(self):
        self.authenticate_admin()
        member = self.create_member(1)
        for amount in ("35.00", "10.00", "20.00"):
            Payment.objects.create(
                member=member,
                amount=Decimal(amount),
                status=Payment.Status.PENDING,
                method=Payment.Method.CASH,
            )

        response = self.client.get("/api/payments/?ordering=amount&limit=3")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        amounts = [Decimal(item["amount"]) for item in response.data["results"]]
        self.assertEqual(amounts, sorted(amounts))

    def test_create_payment_generates_invoice_number_when_missing(self):
        self.authenticate_admin()
        member = self.create_member(1)

        response = self.client.post(
            "/api/payments/",
            {
                "member": member.id,
                "amount": "49.99",
                "purpose": "membership",
                "method": "cash",
                "payment_date": timezone.localdate().isoformat(),
                "notes": "Generated invoice test",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertRegex(
            response.data["invoice_number"],
            r"^INV-\d{8}-\d{4}$",
        )

    def test_create_payment_rejects_manual_overdue_status(self):
        self.authenticate_admin()
        member = self.create_member(2)

        response = self.client.post(
            "/api/payments/",
            {
                "member": member.id,
                "amount": "99.00",
                "status": "overdue",
                "purpose": "other",
                "method": "card",
                "payment_date": timezone.localdate().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_payment_paid_immediately_updates_member_financial_summary(self):
        self.authenticate_admin()
        member = self.create_member(3)

        create_response = self.client.post(
            "/api/payments/",
            {
                "member": member.id,
                "amount": "50.00",
                "purpose": "membership",
                "status": "paid",
                "mark_as_paid": True,
                "method": "cash",
                "payment_date": timezone.localdate().isoformat(),
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_response.data["status"], "paid")

        member_response = self.client.get(f"/api/members/{member.id}/")
        self.assertEqual(member_response.status_code, status.HTTP_200_OK)
        self.assertEqual(_as_decimal(member_response.data["total_paid"]), Decimal("50.00"))
        self.assertEqual(_as_decimal(member_response.data["account_balance"]), Decimal("50.00"))
        self.assertEqual(_as_decimal(member_response.data["outstanding_amount"]), Decimal("0.00"))
        self.assertEqual(member_response.data["balance_status"], "credit")


class RenewalFinancialValidationTests(BaseAPITestCase):
    def test_cannot_renew_with_debt(self):
        self.authenticate_admin()
        member = self.create_member(20)
        MemberCharge.objects.create(
            member=member,
            title="Outstanding",
            purpose=MemberCharge.Purpose.MEMBERSHIP,
            amount=Decimal("100.00"),
            status=MemberCharge.Status.UNPAID,
        )
        response = self.client.post(f"/api/members/{member.id}/renew/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("outstanding_amount", response.data)

    def test_can_renew_when_balance_zero(self):
        self.authenticate_admin()
        member = self.create_member(21)
        MemberCharge.objects.create(
            member=member,
            title="Membership",
            purpose=MemberCharge.Purpose.MEMBERSHIP,
            amount=Decimal("50.00"),
            status=MemberCharge.Status.UNPAID,
        )
        Payment.objects.create(
            member=member,
            amount=Decimal("50.00"),
            status=Payment.Status.PAID,
            purpose=Payment.Purpose.MEMBERSHIP,
            method=Payment.Method.CASH,
            payment_date=timezone.localdate(),
        )
        response = self.client.post(f"/api/members/{member.id}/renew/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_can_renew_when_balance_positive(self):
        self.authenticate_admin()
        member = self.create_member(22)
        Payment.objects.create(
            member=member,
            amount=Decimal("80.00"),
            status=Payment.Status.PAID,
            purpose=Payment.Purpose.OTHER,
            method=Payment.Method.CARD,
            payment_date=timezone.localdate(),
        )
        response = self.client.post(f"/api/members/{member.id}/renew/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_force_renew_bypasses_balance_check(self):
        self.authenticate_admin()
        member = self.create_member(23)
        MemberCharge.objects.create(
            member=member,
            title="Late balance",
            purpose=MemberCharge.Purpose.MEMBERSHIP,
            amount=Decimal("120.00"),
            status=MemberCharge.Status.UNPAID,
        )
        response = self.client.post(
            f"/api/members/{member.id}/renew/",
            {"force_renew": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_settling_charge_enables_renewal(self):
        self.authenticate_admin()
        member = self.create_member(24)
        charge = MemberCharge.objects.create(
            member=member,
            title="Membership due",
            purpose=MemberCharge.Purpose.MEMBERSHIP,
            amount=Decimal("60.00"),
            status=MemberCharge.Status.UNPAID,
        )
        blocked = self.client.post(f"/api/members/{member.id}/renew/", {}, format="json")
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST)

        settled = self.client.patch(
            f"/api/member-charges/{charge.id}/",
            {"status": "paid"},
            format="json",
        )
        self.assertEqual(settled.status_code, status.HTTP_200_OK)

        allowed = self.client.post(f"/api/members/{member.id}/renew/", {}, format="json")
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)


class AttendanceSessionApiTests(BaseAPITestCase):
    def test_active_member_can_check_in(self):
        self.authenticate_admin()
        member = self.create_member(100)
        member.refresh_from_db()
        response = self.client.post(
            "/api/checkins/quick/",
            {"id_number": member.id_number},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["membership_status"], "active")
        self.assertTrue(response.data["is_in_gym"])
        self.assertIsNone(response.data["check_out_time"])

    def test_expired_member_cannot_check_in(self):
        self.authenticate_admin()
        member = self.create_member(101)
        member.end_date = timezone.localdate() - timedelta(days=2)
        member.save(update_fields=["end_date", "updated_at"])

        response = self.client.post(
            "/api/checkins/quick/",
            {"member": member.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            str(_api_detail_value(response.data, "error")),
            "Cannot check in. Membership is not active.",
        )

    def test_inactive_member_cannot_check_in(self):
        self.authenticate_admin()
        member = self.create_member(102)
        member.member_payment_status = RecordedMemberPaymentStatus.PENDING
        member.save(update_fields=["member_payment_status", "updated_at"])

        response = self.client.post(
            "/api/checkins/quick/",
            {"member": member.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            str(_api_detail_value(response.data, "error")),
            "Cannot check in. Membership is not active.",
        )

    def test_cannot_double_check_in_without_checkout(self):
        self.authenticate_admin()
        member = self.create_member(103)
        first = self.client.post("/api/checkins/quick/", {"member": member.id}, format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        second = self.client.post("/api/checkins/quick/", {"member": member.id}, format="json")
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            str(_api_detail_value(second.data, "error")), "Member is already checked in."
        )
        self.assertEqual(
            int(str(_api_detail_value(second.data, "open_checkin_id"))), first.data["id"]
        )

    def test_checked_in_member_can_check_out(self):
        self.authenticate_admin()
        member = self.create_member(104)
        first = self.client.post("/api/checkins/quick/", {"member": member.id}, format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        response = self.client.post(
            "/api/checkins/quick-checkout/",
            {"member": member.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data["check_out_time"])
        self.assertFalse(response.data["is_in_gym"])

    def test_member_not_checked_in_cannot_check_out(self):
        self.authenticate_admin()
        member = self.create_member(105)

        response = self.client.post(
            "/api/checkins/quick-checkout/",
            {"member": member.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            str(_api_detail_value(response.data, "error")),
            "This member is not currently checked in.",
        )

    def test_checkout_via_detail_sets_check_out_time(self):
        self.authenticate_admin()
        member = self.create_member(106)
        created = self.client.post("/api/checkins/quick/", {"member": member.id}, format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        vid = created.data["id"]

        detail = self.client.post(f"/api/checkins/{vid}/checkout/", {}, format="json")
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(detail.data["check_out_time"])

    def test_recent_visits_list_includes_membership_and_check_out(self):
        self.authenticate_admin()
        member = self.create_member(107)
        first = self.client.post("/api/checkins/quick/", {"member": member.id}, format="json")
        vid = first.data["id"]
        self.client.post(f"/api/checkins/{vid}/checkout/", {}, format="json")

        response = self.client.get("/api/checkins/?ordering=-check_in_time&limit=5")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = (
            response.data if isinstance(response.data, list) else response.data["results"]
        )
        row = next(r for r in results if r["id"] == vid)
        self.assertEqual(row["membership_status"], "active")
        self.assertIsNotNone(row["check_out_time"])

    def test_visit_scope_filters_in_gym(self):
        self.authenticate_admin()
        member_open = self.create_member(108)
        member_closed = self.create_member(109)
        self.client.post("/api/checkins/quick/", {"member": member_open.id}, format="json")
        v2 = self.client.post("/api/checkins/quick/", {"member": member_closed.id}, format="json")
        self.client.post(f"/api/checkins/{v2.data['id']}/checkout/", {}, format="json")

        response = self.client.get("/api/checkins/?visit_scope=in_gym&limit=20")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = (
            response.data["results"]
            if "results" in response.data
            else response.data
        )
        open_ids = {r["member"] for r in ids}
        self.assertIn(member_open.id, open_ids)
        self.assertNotIn(member_closed.id, open_ids)


class CheckinApiTests(BaseAPITestCase):
    def test_checkins_list_supports_pagination(self):
        self.authenticate_admin()
        member = self.create_member(1)
        for _ in range(6):
            AttendanceCheckin.objects.create(
                member=member, source=AttendanceCheckin.Source.STAFF
            )

        response = self.client.get("/api/checkins/?page=1&page_size=2")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 6)
        self.assertEqual(len(response.data["results"]), 2)

    def test_checkins_support_ordering(self):
        self.authenticate_admin()
        member = self.create_member(1)
        for _ in range(3):
            AttendanceCheckin.objects.create(
                member=member, source=AttendanceCheckin.Source.STAFF
            )

        response = self.client.get("/api/checkins/?ordering=-check_in_time&page=1&page_size=3")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        checkin_times = [item["check_in_time"] for item in response.data["results"]]
        self.assertEqual(checkin_times, sorted(checkin_times, reverse=True))


class DashboardApiTests(BaseAPITestCase):
    def test_dashboard_returns_expected_totals(self):
        self.authenticate_admin()
        member = self.create_member(1)
        Payment.objects.create(
            member=member,
            amount=Decimal("100.00"),
            status=Payment.Status.PAID,
            method=Payment.Method.CARD,
        )
        MemberCharge.objects.create(
            member=member,
            title="Pending fee",
            purpose=MemberCharge.Purpose.OTHER,
            amount=Decimal("50.00"),
            status=MemberCharge.Status.UNPAID,
        )
        AttendanceCheckin.objects.create(member=member, source=AttendanceCheckin.Source.DESK)

        response = self.client.get("/api/dashboard/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_members"], 1)
        self.assertEqual(response.data["active_memberships"], 1)
        self.assertEqual(response.data["total_revenue"], "100.00")
        self.assertEqual(response.data["unpaid_balances"], "50.00")
