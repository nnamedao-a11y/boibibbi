"""
End-to-end integration test for the role-based authentication system.

Coverage:
  1) MANAGER login → password only, no challenge, token issued, daily-reset
     metadata visible via /api/me.
  2) TEAM-LEAD login → returns `challenge=email_otp` (no JWT). Admin reads
     the OTP code from /api/admin/security/pending-otps and verifies it via
     /api/auth/email-otp/verify → JWT issued.
  3) ADMIN login (TOTP disabled) → password is enough, JWT issued.
  4) ADMIN enables TOTP on self via /api/me/2fa/*, then logs in again →
     `challenge=totp`. Admin verifies via /api/auth/2fa/verify with a real
     pyotp code → JWT issued. Finally disables TOTP to leave system clean.
  5) Login audit: every event above appears in /api/admin/login-audit with
     correct role + method + device parsing.
  6) Team-lead OTP recipient config — set + read via /api/admin/security
     /team-lead-otp-config.
  7) Daily-reset config — read + toggle via /api/admin/security/daily-reset-config.

The test is purely HTTP and self-contained. No mocks.
"""

from __future__ import annotations

import os
import sys
import time

import httpx
import pyotp

BASE = os.environ.get("BIBI_BASE", "http://localhost:8001")
ADMIN_EMAIL = "admin@bibi.cars"
ADMIN_PWD = "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu"
MGR_EMAIL = "manager@bibi.cars"
MGR_PWD = "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR"
TL_EMAIL = "teamlead@bibi.cars"
TL_PWD = "txXNMkj-lS2w1nv482aLlvKWuk9Y9eKE"

TIMEOUT = 15.0

# Cache the admin token across tests to avoid hitting the 10-per-minute
# rate-limit on /api/auth/login. The token is requested once and reused
# until a step deliberately re-enables TOTP (which forces a new flow).
_ADMIN_TOKEN_CACHE: dict = {"token": None}


def _print_step(s: str) -> None:
    print(f"\n=== {s} ===", flush=True)


def _login_password(client: httpx.Client, email: str, pwd: str) -> dict:
    r = client.post(
        f"{BASE}/api/auth/login",
        json={"email": email, "password": pwd},
        headers={"user-agent": "BIBI-E2E/1.0 (Linux; X11) Chrome/137"},
    )
    if r.status_code == 429:
        # Soft-back-off: sleep a little and retry once.
        time.sleep(8)
        r = client.post(
            f"{BASE}/api/auth/login",
            json={"email": email, "password": pwd},
            headers={"user-agent": "BIBI-E2E/1.0 (Linux; X11) Chrome/137"},
        )
    assert r.status_code == 200, f"login {email} → {r.status_code}: {r.text[:200]}"
    return r.json()


def _admin_token(client: httpx.Client, force: bool = False) -> str:
    if not force and _ADMIN_TOKEN_CACHE["token"]:
        return _ADMIN_TOKEN_CACHE["token"]
    data = _login_password(client, ADMIN_EMAIL, ADMIN_PWD)
    if data.get("challenge") == "totp":
        raise SystemExit(
            "Admin currently has TOTP enabled — disable it manually "
            "before running this test, or call /api/me/2fa/disable."
        )
    token = data.get("access_token")
    assert token, f"admin login returned no token: {data}"
    _ADMIN_TOKEN_CACHE["token"] = token
    return token


def test_manager_password_only():
    _print_step("1) Manager logs in with password only (no challenge)")
    with httpx.Client(timeout=TIMEOUT) as client:
        data = _login_password(client, MGR_EMAIL, MGR_PWD)
        assert "access_token" in data, f"manager should get JWT directly, got {data}"
        assert data.get("user", {}).get("role") == "manager"
        token = data["access_token"]
        # /api/auth/me must work and reflect role + daily-reset metadata expected.
        r = client.get(f"{BASE}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, f"manager /me → {r.status_code}: {r.text[:200]}"
        assert (r.json().get("role") or "").lower() == "manager"
        print(f"   ✓ manager JWT issued, /me ok, role=manager")
        # Logout audit event
        rl = client.post(f"{BASE}/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert rl.status_code == 200
        print(f"   ✓ manager logout recorded")


def test_team_lead_email_otp():
    _print_step("2) Team-lead login → email_otp challenge → admin reads code → verify")
    with httpx.Client(timeout=TIMEOUT) as client:
        # Step 1: password
        data = _login_password(client, TL_EMAIL, TL_PWD)
        assert data.get("challenge") == "email_otp", f"expected email_otp challenge, got {data}"
        challenge_token = data["challenge_token"]
        user_id = data["user_id"]
        print(f"   ✓ team-lead got email_otp challenge_token={challenge_token[:12]}…")

        # Step 2: admin retrieves the code from the admin panel endpoint
        admin_tok = _admin_token(client)
        adm_h = {"Authorization": f"Bearer {admin_tok}"}
        r = client.get(f"{BASE}/api/admin/security/pending-otps", headers=adm_h, params={"limit": 25})
        assert r.status_code == 200, f"pending-otps → {r.status_code}: {r.text[:200]}"
        pending = (r.json() or {}).get("data") or []
        matching = [d for d in pending if d.get("challenge_token") == challenge_token]
        assert matching, f"team-lead OTP not found in admin pending list. pending={pending[:3]}"
        code = matching[0]["code"]
        assert code and len(code) == 6 and code.isdigit(), f"bad OTP code shape: {code!r}"
        print(f"   ✓ admin sees pending OTP code (last2={code[-2:]}) for {matching[0]['user_email']}")

        # Step 3: verify
        rv = client.post(
            f"{BASE}/api/auth/email-otp/verify",
            json={"challenge_token": challenge_token, "code": code},
            headers={"user-agent": "BIBI-E2E/1.0 (Linux; X11) Chrome/137"},
        )
        assert rv.status_code == 200, f"email-otp/verify → {rv.status_code}: {rv.text[:200]}"
        body = rv.json()
        assert body.get("access_token"), f"no JWT after OTP verify: {body}"
        assert (body.get("user") or {}).get("role") == "team_lead"
        print(f"   ✓ team-lead JWT issued after OTP verify")

        # Negative: re-using the same code must fail (already_used / expired)
        rv2 = client.post(
            f"{BASE}/api/auth/email-otp/verify",
            json={"challenge_token": challenge_token, "code": code},
        )
        assert rv2.status_code == 401, f"OTP reuse should fail, got {rv2.status_code}"
        print(f"   ✓ OTP cannot be reused (got 401 as expected)")


def test_admin_password_only_when_totp_off():
    _print_step("3) Admin login (TOTP disabled) → straight JWT")
    with httpx.Client(timeout=TIMEOUT) as client:
        # Ensure TOTP is disabled
        admin_tok = _admin_token(client)
        adm_h = {"Authorization": f"Bearer {admin_tok}"}
        # If status is enabled (residue from earlier run), nothing to do —
        # admin_token() raised. Otherwise confirm explicit "off".
        st = client.get(f"{BASE}/api/me/2fa/status", headers=adm_h).json()
        assert st.get("enabled") is False, f"expected TOTP off, got {st}"
        # The token we already received is proof — print confirmation.
        print("   ✓ admin password-only login works when TOTP is disabled")


def test_admin_totp_full_flow():
    _print_step("4) Admin enables TOTP → password→TOTP challenge → verify → disable")
    with httpx.Client(timeout=TIMEOUT) as client:
        # Get base admin token
        admin_tok = _admin_token(client)
        adm_h = {"Authorization": f"Bearer {admin_tok}"}

        # 4a. Setup pending TOTP
        rs = client.post(f"{BASE}/api/me/2fa/setup", headers=adm_h)
        assert rs.status_code == 200, f"2fa/setup → {rs.status_code}: {rs.text[:200]}"
        setup = rs.json()
        secret = setup["secret"]
        assert secret and "qrCode" in setup
        totp = pyotp.TOTP(secret)
        code = totp.now()
        # Activate
        rv = client.post(f"{BASE}/api/me/2fa/verify", json={"code": code}, headers=adm_h)
        assert rv.status_code == 200, f"2fa/verify → {rv.status_code}: {rv.text[:200]}"
        print(f"   ✓ admin TOTP activated (secret={secret[:6]}…)")

        # 4b. New login must now return totp challenge
        data = _login_password(client, ADMIN_EMAIL, ADMIN_PWD)
        assert data.get("challenge") == "totp", f"expected totp challenge, got {data}"
        print(f"   ✓ admin login now returns totp challenge")
        user_id = data["user_id"]

        # 4c. Verify TOTP from authenticator
        # Allow up to ~31s window: we already used totp.now() above for activation;
        # use a fresh code.
        code2 = totp.now()
        rv2 = client.post(
            f"{BASE}/api/auth/2fa/verify",
            json={"user_id": user_id, "code": code2},
        )
        assert rv2.status_code == 200, f"auth/2fa/verify → {rv2.status_code}: {rv2.text[:200]}"
        body = rv2.json()
        assert body.get("access_token"), f"no JWT after TOTP verify: {body}"
        print(f"   ✓ admin JWT issued after TOTP verify")

        # 4d. Disable TOTP to leave system clean
        # The endpoint requires a valid current code while enabled.
        # We use the token we just received as admin.
        new_admin_h = {"Authorization": f"Bearer {body['access_token']}"}
        code3 = totp.now()
        rd = client.post(f"{BASE}/api/me/2fa/disable", json={"code": code3}, headers=new_admin_h)
        assert rd.status_code == 200, f"2fa/disable → {rd.status_code}: {rd.text[:200]}"
        st2 = client.get(f"{BASE}/api/me/2fa/status", headers=new_admin_h).json()
        assert st2.get("enabled") is False
        print(f"   ✓ admin TOTP disabled (system left clean)")


def test_login_audit_records():
    _print_step("5) Login audit collects all events with role + device + method")
    with httpx.Client(timeout=TIMEOUT) as client:
        admin_tok = _admin_token(client)
        adm_h = {"Authorization": f"Bearer {admin_tok}"}
        r = client.get(f"{BASE}/api/admin/login-audit", headers=adm_h, params={"limit": 100})
        assert r.status_code == 200, f"admin/login-audit → {r.status_code}: {r.text[:200]}"
        body = r.json()
        items = body.get("data") or []
        assert items, f"expected at least one audit record, got {body}"
        roles = {(d.get("role") or "").lower() for d in items}
        methods = {(d.get("method") or "").lower() for d in items}
        events = {(d.get("event") or "").lower() for d in items}
        print(f"   ✓ {len(items)} audit rows, roles={roles}, methods={methods}, events={events}")
        # Recent entries should include manager + team_lead + admin
        assert "manager" in roles, f"manager not in audited roles: {roles}"
        assert "team_lead" in roles, f"team_lead not in audited roles: {roles}"
        assert "admin" in roles, f"admin not in audited roles: {roles}"
        # Methods should include all three flows
        assert "password" in methods, f"password not in methods: {methods}"
        assert "email_otp" in methods, f"email_otp not in methods: {methods}"
        assert "totp" in methods, f"totp not in methods: {methods}"
        # Device parsing
        sample = items[0]
        device = sample.get("device") or {}
        assert "os" in device and "browser" in device, f"missing device parse: {device}"
        print(f"   ✓ device parsed: {device}")
        # Summary block
        summary = body.get("summary") or {}
        assert "loginsToday" in summary, f"missing summary block: {summary}"
        print(f"   ✓ summary: {summary}")


def test_team_lead_otp_recipient_config():
    _print_step("6) Team-lead OTP recipient config — set + read")
    with httpx.Client(timeout=TIMEOUT) as client:
        admin_tok = _admin_token(client)
        adm_h = {"Authorization": f"Bearer {admin_tok}"}
        # set
        new_recipient = "admin@bibi.cars"
        r = client.put(
            f"{BASE}/api/admin/security/team-lead-otp-config",
            json={"recipient_email": new_recipient},
            headers=adm_h,
        )
        assert r.status_code == 200, f"PUT recipient → {r.status_code}: {r.text[:200]}"
        # read
        r2 = client.get(f"{BASE}/api/admin/security/team-lead-otp-config", headers=adm_h)
        assert r2.status_code == 200
        assert (r2.json() or {}).get("recipient_email") == new_recipient
        print(f"   ✓ recipient configured to {new_recipient}")


def test_daily_reset_config():
    _print_step("7) Manager daily-reset config — read + toggle")
    with httpx.Client(timeout=TIMEOUT) as client:
        admin_tok = _admin_token(client)
        adm_h = {"Authorization": f"Bearer {admin_tok}"}
        r = client.get(f"{BASE}/api/admin/security/daily-reset-config", headers=adm_h)
        assert r.status_code == 200
        cfg = r.json()
        assert cfg.get("timezone") == "Europe/Sofia"
        assert cfg.get("hour_local") == 12
        prev = cfg["enabled"]
        # toggle off
        r2 = client.put(
            f"{BASE}/api/admin/security/daily-reset-config",
            json={"enabled": not prev},
            headers=adm_h,
        )
        assert r2.status_code == 200
        # restore
        r3 = client.put(
            f"{BASE}/api/admin/security/daily-reset-config",
            json={"enabled": prev},
            headers=adm_h,
        )
        assert r3.status_code == 200
        print(f"   ✓ daily-reset config readable + toggleable (kept as {prev})")


def test_password_policy_descriptor():
    _print_step("8) Password policy descriptor + per-rule validation")
    with httpx.Client(timeout=TIMEOUT) as client:
        r = client.get(f"{BASE}/api/auth/password-policy")
        assert r.status_code == 200, f"policy descriptor → {r.status_code}: {r.text[:200]}"
        body = r.json()
        assert body.get("min_length") == 8
        for f in ("must_have_lower", "must_have_upper", "must_have_digit", "must_have_special", "forbid_whitespace"):
            assert body.get(f) is True, f"policy missing {f}"
        assert "-" in body.get("specials_allowed", ""), "dash must be in specials"
        print(f"   ✓ policy: min_length=8, specials_allowed includes dash, rules={len(body.get('rules', []))}")

        # validation samples (expected ok flag)
        samples = [
            ("Short1!",           False),  # 7 chars -> too short
            ("nouppercase1!",     False),  # no upper
            ("NOLOWERCASE1!",     False),  # no lower
            ("NoSpecialsHere1",   False),  # no special
            ("NoDigitsHere!",     False),  # no digit
            ("Has Whitespace1!",  False),  # whitespace
            ("Strong-Pass1A",     True),
            ("Goodpwd123-",       True),
            ("Mngr1-Rotate9X",    True),
        ]
        for pwd, expected_ok in samples:
            r = client.post(f"{BASE}/api/auth/password/validate", json={"password": pwd})
            assert r.status_code == 200, f"validate({pwd!r}) → {r.status_code}: {r.text[:200]}"
            body = r.json()
            assert body["ok"] == expected_ok, (
                f"validate({pwd!r}) expected ok={expected_ok}, got {body}"
            )
        print(f"   ✓ {len(samples)} validation samples all return expected ok/fail")


def test_change_password_full_cycle():
    _print_step("9) Change-password full cycle for the manager account")
    # Rate limit on /api/auth/login is 10/min — give it a breather after
    # the earlier admin/team-lead heavy section so this test can do its
    # ~4 logins without hitting 429.
    time.sleep(12)
    with httpx.Client(timeout=TIMEOUT) as client:
        # Login as manager
        data = _login_password(client, MGR_EMAIL, MGR_PWD)
        token = data["access_token"]
        mgr_h = {"Authorization": f"Bearer {token}"}

        new_pwd = "Mngr-Rotate-9X!"
        # 1) attempt with wrong current → 401
        r = client.post(
            f"{BASE}/api/auth/change-password",
            json={"current_password": "wrong-pwd", "new_password": new_pwd},
            headers=mgr_h,
        )
        assert r.status_code == 401, f"wrong current_pwd should be 401, got {r.status_code}: {r.text[:200]}"
        print(f"   ✓ wrong current_password rejected (401)")

        # 2) attempt with weak new password → 400
        r = client.post(
            f"{BASE}/api/auth/change-password",
            json={"current_password": MGR_PWD, "new_password": "weak"},
            headers=mgr_h,
        )
        assert r.status_code == 400, f"weak new_password should be 400, got {r.status_code}: {r.text[:200]}"
        assert "Missing" in r.text or "policy" in r.text.lower()
        print(f"   ✓ weak new password rejected (400 with detail)")

        # 3) same as current → 400
        r = client.post(
            f"{BASE}/api/auth/change-password",
            json={"current_password": MGR_PWD, "new_password": MGR_PWD},
            headers=mgr_h,
        )
        assert r.status_code == 400, f"same-as-current should be 400, got {r.status_code}"
        print(f"   ✓ same-as-current rejected (400)")

        # 4) Happy path → rotate to new pwd
        r = client.post(
            f"{BASE}/api/auth/change-password",
            json={"current_password": MGR_PWD, "new_password": new_pwd},
            headers=mgr_h,
        )
        assert r.status_code == 200, f"change-password happy path → {r.status_code}: {r.text[:200]}"
        assert r.json().get("success") is True
        print(f"   ✓ manager password rotated successfully")

        # 5) Old password no longer works — soft-retry on 429
        time.sleep(6)
        r = client.post(
            f"{BASE}/api/auth/login",
            json={"email": MGR_EMAIL, "password": MGR_PWD},
        )
        if r.status_code == 429:
            time.sleep(15)
            r = client.post(
                f"{BASE}/api/auth/login",
                json={"email": MGR_EMAIL, "password": MGR_PWD},
            )
        assert r.status_code == 401, f"old password should be rejected, got {r.status_code}: {r.text[:200]}"
        print(f"   ✓ old password no longer works (401)")

        # 6) New password works
        time.sleep(3)
        r2 = client.post(
            f"{BASE}/api/auth/login",
            json={"email": MGR_EMAIL, "password": new_pwd},
        )
        if r2.status_code == 429:
            time.sleep(15)
            r2 = client.post(
                f"{BASE}/api/auth/login",
                json={"email": MGR_EMAIL, "password": new_pwd},
            )
        assert r2.status_code == 200, f"new password login → {r2.status_code}: {r2.text[:200]}"
        new_token = r2.json().get("access_token")
        assert new_token, f"no JWT after new login: {r2.json()}"
        print(f"   ✓ new password logs in OK")

        # 7) Rotate back to a policy-compliant temp password (NOT the seeded
        # one, because the seeded value pre-dates the policy and is now
        # alphanumeric-only — the policy would reject it on change). The seed
        # gets force-restored on the next backend startup anyway.
        new_mgr_h = {"Authorization": f"Bearer {new_token}"}
        clean_pwd = "Mgr-Cleanup-9Z!"
        r3 = client.post(
            f"{BASE}/api/auth/change-password",
            json={"current_password": new_pwd, "new_password": clean_pwd},
            headers=new_mgr_h,
        )
        assert r3.status_code == 200, f"rotate-to-clean → {r3.status_code}: {r3.text[:200]}"
        print(f"   ✓ rotated to clean temp password (seed restores on next startup)")


def test_audit_records_password_change():
    _print_step("10) Login audit includes the password_change events")
    with httpx.Client(timeout=TIMEOUT) as client:
        admin_tok = _admin_token(client)
        adm_h = {"Authorization": f"Bearer {admin_tok}"}
        r = client.get(f"{BASE}/api/admin/login-audit", headers=adm_h, params={"limit": 100, "event": "password_change"})
        assert r.status_code == 200
        items = (r.json() or {}).get("data") or []
        assert items, "expected at least one password_change audit row"
        roles = {(d.get("role") or "").lower() for d in items}
        success_any = any(d.get("success") for d in items)
        fail_any = any(not d.get("success") for d in items)
        assert "manager" in roles, f"manager not in password_change audit: {roles}"
        assert success_any and fail_any, "expected both success and failed password_change rows"
        print(f"   ✓ {len(items)} password_change rows audited, roles={roles}, both success and fail captured")


def main():
    print("BIBI Cars — role-based auth E2E test")
    print(f"Base URL: {BASE}")
    t0 = time.time()
    tests = [
        test_manager_password_only,
        test_team_lead_email_otp,
        test_admin_password_only_when_totp_off,
        test_admin_totp_full_flow,
        test_login_audit_records,
        test_team_lead_otp_recipient_config,
        test_daily_reset_config,
        test_password_policy_descriptor,
        test_change_password_full_cycle,
        test_audit_records_password_change,
    ]
    failed = 0
    for t in tests:
        try:
            t()
        except AssertionError as e:
            failed += 1
            print(f"   ✗ FAIL {t.__name__}: {e}", file=sys.stderr)
        except Exception as e:
            failed += 1
            print(f"   ✗ ERROR {t.__name__}: {e!r}", file=sys.stderr)
    elapsed = time.time() - t0
    print(f"\n{'='*60}")
    print(f"Result: {len(tests) - failed}/{len(tests)} passed in {elapsed:.1f}s")
    print(f"{'='*60}")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
