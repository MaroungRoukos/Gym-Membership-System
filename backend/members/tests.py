from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import AttendanceCheckin, Member, Payment, RecordedMemberPaymentStatus


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
                "status": "pending",
                "method": "cash",
                "description": "Generated invoice test",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertRegex(
            response.data["invoice_number"],
            r"^INV-\d{8}-\d{4}$",
        )

    def test_create_payment_keeps_explicit_invoice_number_when_provided(self):
        self.authenticate_admin()
        member = self.create_member(2)
        explicit_invoice = "INV-20260501-9999"

        response = self.client.post(
            "/api/payments/",
            {
                "member": member.id,
                "amount": "99.00",
                "status": "pending",
                "method": "card",
                "invoice_number": explicit_invoice,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["invoice_number"], explicit_invoice)


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

        response = self.client.get("/api/checkins/?ordering=-checked_in_at&page=1&page_size=3")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        checkin_times = [item["checked_in_at"] for item in response.data["results"]]
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
        Payment.objects.create(
            member=member,
            amount=Decimal("50.00"),
            status=Payment.Status.PENDING,
            method=Payment.Method.CASH,
        )
        AttendanceCheckin.objects.create(member=member, source=AttendanceCheckin.Source.DESK)

        response = self.client.get("/api/dashboard/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_members"], 1)
        self.assertEqual(response.data["active_memberships"], 1)
        self.assertEqual(response.data["total_revenue"], "100.00")
        self.assertEqual(response.data["unpaid_balances"], "50.00")
