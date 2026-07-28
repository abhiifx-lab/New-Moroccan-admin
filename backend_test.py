#!/usr/bin/env python3
"""
Comprehensive Backend Test for Spa ERP
Tests the complete end-to-end scenario with financial engine verification
"""

import requests
import json
from datetime import datetime

# Load BASE_URL from .env
BASE_URL = "https://multi-centre-spa-ops.preview.emergentagent.com/api"

def log_test(name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status}: {name}")
    if details:
        print(f"  {details}")
    return passed

def test_centres_and_services():
    """Test 1: Fetch centres and services"""
    print("\n" + "="*80)
    print("TEST 1: Centres & Services")
    print("="*80)
    
    try:
        # Get centres
        resp = requests.get(f"{BASE_URL}/centres")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        centres = resp.json()
        assert len(centres) >= 4, f"Expected at least 4 centres, got {len(centres)}"
        
        centre_names = [c['name'] for c in centres]
        log_test("Centres fetched", True, f"Found {len(centres)} centres: {', '.join(centre_names)}")
        
        # Get services
        resp = requests.get(f"{BASE_URL}/services")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        services = resp.json()
        assert len(services) >= 5, f"Expected at least 5 services, got {len(services)}"
        
        log_test("Services fetched", True, f"Found {len(services)} services")
        
        return centres[0]  # Return first centre for subsequent tests
        
    except Exception as e:
        log_test("Centres & Services", False, str(e))
        raise

def test_end_to_end_scenario(centre):
    """Test 2-11: Complete end-to-end scenario"""
    print("\n" + "="*80)
    print("TEST 2-11: End-to-End Financial Scenario")
    print("="*80)
    
    centre_id = centre['id']
    print(f"\nUsing Centre: {centre['name']} (ID: {centre_id})")
    
    # Get today's date from the API's perspective
    resp = requests.get(f"{BASE_URL}/business-day?centre_id={centre_id}")
    assert resp.status_code == 200
    bd = resp.json()
    today = bd['business_date']
    print(f"Business Date: {today}")
    
    try:
        # Step 2: Set opening cash = 500000 paise (₹5000)
        print("\n--- Step 2: Set Opening Cash ---")
        resp = requests.post(f"{BASE_URL}/business-day/set-opening", json={
            "centre_id": centre_id,
            "opening_cash": 500000
        })
        assert resp.status_code == 200, f"Set opening failed: {resp.status_code}"
        log_test("Set opening cash to 500000 paise", True)
        
        # Step 3a: Booking CASH 350000 (customer A)
        print("\n--- Step 3a: Booking CASH 350000 ---")
        resp = requests.post(f"{BASE_URL}/events/booking", json={
            "centre_id": centre_id,
            "customer": "Arjun Mehta",
            "therapist": "Priya",
            "service_name": "Signature Massage",
            "amount": 350000,
            "payment_method": "CASH"
        })
        assert resp.status_code == 200, f"Booking A failed: {resp.status_code}"
        log_test("Booking A (CASH 350000)", True)
        
        # Step 3b: Booking UPI 400000 (customer B)
        print("\n--- Step 3b: Booking UPI 400000 ---")
        resp = requests.post(f"{BASE_URL}/events/booking", json={
            "centre_id": centre_id,
            "customer": "Bhavna Singh",
            "therapist": "Ravi",
            "service_name": "Aromatherapy",
            "amount": 400000,
            "payment_method": "UPI"
        })
        assert resp.status_code == 200, f"Booking B failed: {resp.status_code}"
        log_test("Booking B (UPI 400000)", True)
        
        # Step 3c: Booking MIXED 350000 (cash 100000, upi 200000, card 50000) (customer C)
        print("\n--- Step 3c: Booking MIXED 350000 ---")
        resp = requests.post(f"{BASE_URL}/events/booking", json={
            "centre_id": centre_id,
            "customer": "Chitra Desai",
            "therapist": "Anjali",
            "service_name": "Deep Tissue",
            "amount": 350000,
            "payment_method": "MIXED",
            "payment_breakdown": {
                "cash": 100000,
                "upi": 200000,
                "card": 50000
            }
        })
        assert resp.status_code == 200, f"Booking C failed: {resp.status_code}"
        log_test("Booking C (MIXED 350000)", True)
        
        # Step 4: Sell membership 1000000 CASH (customer D)
        print("\n--- Step 4: Sell Membership 1000000 ---")
        resp = requests.post(f"{BASE_URL}/events/membership", json={
            "centre_id": centre_id,
            "customer": "Deepak Kumar",
            "phone": "9876543210",
            "amount": 1000000,
            "payment_method": "CASH"
        })
        assert resp.status_code == 200, f"Membership sale failed: {resp.status_code}"
        membership_data = resp.json()
        membership_code = membership_data['membership']['code']
        log_test("Membership sold (1000000 CASH)", True, f"Code: {membership_code}")
        
        # Step 5: Sell gift card 500000 CASH (customer E to recipient F)
        print("\n--- Step 5: Sell Gift Card 500000 ---")
        resp = requests.post(f"{BASE_URL}/events/gift-card", json={
            "centre_id": centre_id,
            "customer": "Esha Patel",
            "recipient": "Farhan Ali",
            "amount": 500000,
            "payment_method": "CASH"
        })
        assert resp.status_code == 200, f"Gift card sale failed: {resp.status_code}"
        gc_data = resp.json()
        gc_code = gc_data['gift_card']['code']
        log_test("Gift card sold (500000 CASH)", True, f"Code: {gc_code}")
        
        # Step 6: Redeem membership 200000 (customer D)
        print("\n--- Step 6: Redeem Membership 200000 ---")
        resp = requests.post(f"{BASE_URL}/events/booking", json={
            "centre_id": centre_id,
            "customer": "Deepak Kumar",
            "therapist": "Priya",
            "service_name": "Couple Ritual",
            "amount": 200000,
            "payment_method": "MEMBERSHIP",
            "redemption_ref": membership_code
        })
        assert resp.status_code == 200, f"Membership redemption failed: {resp.status_code}"
        log_test("Membership redeemed (200000)", True)
        
        # Step 7: Redeem gift card 150000 (customer F)
        print("\n--- Step 7: Redeem Gift Card 150000 ---")
        resp = requests.post(f"{BASE_URL}/events/booking", json={
            "centre_id": centre_id,
            "customer": "Farhan Ali",
            "therapist": "Ravi",
            "service_name": "Facial Glow",
            "amount": 150000,
            "payment_method": "GIFT_CARD",
            "redemption_ref": gc_code
        })
        assert resp.status_code == 200, f"Gift card redemption failed: {resp.status_code}"
        log_test("Gift card redeemed (150000)", True)
        
        # Step 8: Expense CASH 50000
        print("\n--- Step 8: Expense CASH 50000 ---")
        resp = requests.post(f"{BASE_URL}/events/expense", json={
            "centre_id": centre_id,
            "amount": 50000,
            "payment_method": "CASH",
            "category": "Utilities"
        })
        assert resp.status_code == 200, f"Expense CASH failed: {resp.status_code}"
        log_test("Expense CASH 50000", True)
        
        # Step 9: Expense UPI 30000
        print("\n--- Step 9: Expense UPI 30000 ---")
        resp = requests.post(f"{BASE_URL}/events/expense", json={
            "centre_id": centre_id,
            "amount": 30000,
            "payment_method": "UPI",
            "category": "Supplies"
        })
        assert resp.status_code == 200, f"Expense UPI failed: {resp.status_code}"
        log_test("Expense UPI 30000", True)
        
        # Step 10: Cash movement BANK_DEPOSIT 200000
        print("\n--- Step 10: Cash Movement BANK_DEPOSIT 200000 ---")
        resp = requests.post(f"{BASE_URL}/events/cash-movement", json={
            "centre_id": centre_id,
            "amount": 200000,
            "movement_type": "BANK_DEPOSIT"
        })
        assert resp.status_code == 200, f"BANK_DEPOSIT failed: {resp.status_code}"
        log_test("BANK_DEPOSIT 200000", True)
        
        # Step 11: Cash movement FLOAT_ADDED 100000
        print("\n--- Step 11: Cash Movement FLOAT_ADDED 100000 ---")
        resp = requests.post(f"{BASE_URL}/events/cash-movement", json={
            "centre_id": centre_id,
            "amount": 100000,
            "movement_type": "FLOAT_ADDED"
        })
        assert resp.status_code == 200, f"FLOAT_ADDED failed: {resp.status_code}"
        log_test("FLOAT_ADDED 100000", True)
        
        return centre_id, today, membership_code, gc_code
        
    except Exception as e:
        log_test("End-to-end scenario", False, str(e))
        raise

def test_dashboard_verification(centre_id, today):
    """Test 12: Verify Dashboard Calculations"""
    print("\n" + "="*80)
    print("TEST 12: Dashboard Verification")
    print("="*80)
    
    try:
        resp = requests.get(f"{BASE_URL}/dashboard?centre_id={centre_id}&date={today}")
        assert resp.status_code == 200, f"Dashboard fetch failed: {resp.status_code}"
        data = resp.json()
        agg = data['agg']
        
        print("\n--- Expected vs Actual ---")
        
        # Expected values
        expected = {
            'total_revenue': 2600000,  # 350000 + 400000 + 350000 + 1000000 + 500000
            'booking_sales': 1100000,  # 350000 + 400000 + 350000
            'membership_sales': 1000000,
            'gift_card_sales': 500000,
            'cash_sales': 1950000,  # 350000 + 100000 + 1000000 + 500000
            'upi_sales': 600000,  # 400000 + 200000
            'card_sales': 50000,
            'total_expenses': 80000,  # 50000 + 30000
            'cash_expenses': 50000,
            'upi_expenses': 30000,
            'cash_deposited': 200000,
            'float_added': 100000,
            'redemptions': 2,
            'bookings': 5,  # 3 paid + 2 redeemed
            'memberships_sold': 1,
            'gift_cards_sold': 1,
            'closing_cash_expected': 2300000,  # 500000 + 1950000 + 100000 - 50000 - 200000
            'guests': 6  # A, B, C, D, E, F
        }
        
        all_passed = True
        for key, exp_val in expected.items():
            act_val = agg.get(key, 0)
            passed = act_val == exp_val
            all_passed = all_passed and passed
            status = "✅" if passed else "❌"
            print(f"{status} {key}: Expected {exp_val}, Got {act_val}")
        
        log_test("Dashboard calculations", all_passed)
        return all_passed
        
    except Exception as e:
        log_test("Dashboard verification", False, str(e))
        raise

def test_memberships_and_gift_cards(membership_code, gc_code):
    """Test 13: Verify Membership and Gift Card Balances"""
    print("\n" + "="*80)
    print("TEST 13: Membership & Gift Card Balances")
    print("="*80)
    
    try:
        # Check membership balance
        resp = requests.get(f"{BASE_URL}/memberships")
        assert resp.status_code == 200
        memberships = resp.json()
        membership = next((m for m in memberships if m['code'] == membership_code), None)
        assert membership is not None, f"Membership {membership_code} not found"
        
        expected_remaining = 800000  # 1000000 - 200000
        actual_remaining = membership['remaining_paise']
        passed_m = actual_remaining == expected_remaining
        log_test("Membership balance", passed_m, 
                f"Expected {expected_remaining}, Got {actual_remaining}")
        
        # Check gift card balance
        resp = requests.get(f"{BASE_URL}/gift-cards")
        assert resp.status_code == 200
        gift_cards = resp.json()
        gc = next((g for g in gift_cards if g['code'] == gc_code), None)
        assert gc is not None, f"Gift card {gc_code} not found"
        
        expected_remaining_gc = 350000  # 500000 - 150000
        actual_remaining_gc = gc['remaining_paise']
        passed_gc = actual_remaining_gc == expected_remaining_gc
        log_test("Gift card balance", passed_gc,
                f"Expected {expected_remaining_gc}, Got {actual_remaining_gc}")
        
        return passed_m and passed_gc
        
    except Exception as e:
        log_test("Memberships & Gift Cards", False, str(e))
        raise

def test_master_register(centre_id, today):
    """Test 14: Verify Master Register"""
    print("\n" + "="*80)
    print("TEST 14: Master Register")
    print("="*80)
    
    try:
        resp = requests.get(f"{BASE_URL}/master-register?centre_id={centre_id}&from={today}&to={today}")
        assert resp.status_code == 200, f"Master register fetch failed: {resp.status_code}"
        data = resp.json()
        rows = data['rows']
        
        assert len(rows) == 1, f"Expected 1 row, got {len(rows)}"
        row = rows[0]
        
        # Verify key fields match dashboard
        expected = {
            'total_revenue': 2600000,
            'booking_sales': 1100000,
            'cash_sales': 1950000,
            'closing_cash_expected': 2300000
        }
        
        all_passed = True
        for key, exp_val in expected.items():
            act_val = row.get(key, 0)
            passed = act_val == exp_val
            all_passed = all_passed and passed
            status = "✅" if passed else "❌"
            print(f"{status} {key}: Expected {exp_val}, Got {act_val}")
        
        log_test("Master register row", all_passed)
        return all_passed
        
    except Exception as e:
        log_test("Master register", False, str(e))
        raise

def test_cash_book(centre_id, today):
    """Test 15: Verify Cash Book"""
    print("\n" + "="*80)
    print("TEST 15: Cash Book")
    print("="*80)
    
    try:
        resp = requests.get(f"{BASE_URL}/cash-book?centre_id={centre_id}&date={today}")
        assert resp.status_code == 200, f"Cash book fetch failed: {resp.status_code}"
        data = resp.json()
        lines = data['lines']
        agg = data['agg']
        
        # Check opening line
        opening_line = lines[0]
        assert opening_line['ref'] == 'OPENING', "First line should be OPENING"
        assert opening_line['running'] == 500000, f"Opening should be 500000, got {opening_line['running']}"
        log_test("Cash book opening", True, f"Opening: {opening_line['running']}")
        
        # Check final running balance
        last_line = lines[-1]
        expected_final = 2300000
        actual_final = last_line['running']
        passed_final = actual_final == expected_final
        log_test("Cash book final balance", passed_final,
                f"Expected {expected_final}, Got {actual_final}")
        
        # Check aggregate closing_cash_expected
        passed_agg = agg['closing_cash_expected'] == expected_final
        log_test("Cash book aggregate", passed_agg,
                f"Expected {expected_final}, Got {agg['closing_cash_expected']}")
        
        return passed_final and passed_agg
        
    except Exception as e:
        log_test("Cash book", False, str(e))
        raise

def test_business_day_close_reopen(centre_id, today):
    """Test 16: Business Day Close and Reopen"""
    print("\n" + "="*80)
    print("TEST 16: Business Day Close & Reopen")
    print("="*80)
    
    try:
        # Close the day with declared cash = 2295000 (variance = -5000)
        print("\n--- Close Business Day ---")
        resp = requests.post(f"{BASE_URL}/business-day/close", json={
            "centre_id": centre_id,
            "closing_cash_declared": 2295000,
            "actor": "reception",
            "role": "RECEPTION"
        })
        assert resp.status_code == 200, f"Close day failed: {resp.status_code}"
        close_data = resp.json()
        
        expected_val = 2300000
        declared_val = 2295000
        variance_val = -5000
        
        passed_close = (
            close_data['expected'] == expected_val and
            close_data['declared'] == declared_val and
            close_data['variance'] == variance_val
        )
        log_test("Business day closed", passed_close,
                f"Expected: {expected_val}, Declared: {declared_val}, Variance: {variance_val}")
        
        # Verify status is CLOSED
        resp = requests.get(f"{BASE_URL}/business-day?centre_id={centre_id}&date={today}")
        assert resp.status_code == 200
        bd = resp.json()
        assert bd['status'] == 'CLOSED', f"Expected CLOSED, got {bd['status']}"
        log_test("Business day status CLOSED", True)
        
        # Try to create a booking (should fail)
        print("\n--- Try Booking on Closed Day ---")
        resp = requests.post(f"{BASE_URL}/events/booking", json={
            "centre_id": centre_id,
            "customer": "Test User",
            "amount": 100000,
            "payment_method": "CASH"
        })
        passed_blocked = resp.status_code == 400
        error_msg = resp.json().get('error', '')
        log_test("Booking blocked on closed day", passed_blocked, f"Error: {error_msg}")
        
        # Try to reopen with RECEPTION role (should fail)
        print("\n--- Try Reopen with RECEPTION (should fail) ---")
        resp = requests.post(f"{BASE_URL}/business-day/reopen", json={
            "centre_id": centre_id,
            "business_date": today,
            "actor": "reception",
            "role": "RECEPTION",
            "reason": "Test reopen"
        })
        passed_forbidden = resp.status_code == 403
        log_test("Reopen blocked for RECEPTION", passed_forbidden)
        
        # Reopen with MANAGER role (should succeed)
        print("\n--- Reopen with MANAGER ---")
        resp = requests.post(f"{BASE_URL}/business-day/reopen", json={
            "centre_id": centre_id,
            "business_date": today,
            "actor": "jane",
            "role": "MANAGER",
            "reason": "Correction needed"
        })
        assert resp.status_code == 200, f"Reopen failed: {resp.status_code}"
        log_test("Reopen with MANAGER", True)
        
        # Verify status is OPEN
        resp = requests.get(f"{BASE_URL}/business-day?centre_id={centre_id}&date={today}")
        assert resp.status_code == 200
        bd = resp.json()
        assert bd['status'] == 'OPEN', f"Expected OPEN, got {bd['status']}"
        log_test("Business day status OPEN", True)
        
        # Try booking again (should succeed)
        print("\n--- Try Booking After Reopen ---")
        resp = requests.post(f"{BASE_URL}/events/booking", json={
            "centre_id": centre_id,
            "customer": "Test User After Reopen",
            "amount": 100000,
            "payment_method": "CASH"
        })
        passed_allowed = resp.status_code == 200
        log_test("Booking allowed after reopen", passed_allowed)
        
        return passed_close and passed_blocked and passed_forbidden and passed_allowed
        
    except Exception as e:
        log_test("Business day close/reopen", False, str(e))
        raise

def test_audit_log():
    """Test 17: Verify Audit Log"""
    print("\n" + "="*80)
    print("TEST 17: Audit Log")
    print("="*80)
    
    try:
        resp = requests.get(f"{BASE_URL}/audit-log")
        assert resp.status_code == 200, f"Audit log fetch failed: {resp.status_code}"
        audit_entries = resp.json()
        
        # Check for CLOSE_DAY and REOPEN_DAY entries
        actions = [entry['action'] for entry in audit_entries]
        has_close = 'CLOSE_DAY' in actions
        has_reopen = 'REOPEN_DAY' in actions
        
        log_test("Audit log has CLOSE_DAY", has_close)
        log_test("Audit log has REOPEN_DAY", has_reopen)
        
        return has_close and has_reopen
        
    except Exception as e:
        log_test("Audit log", False, str(e))
        raise

def test_error_cases(centre_id):
    """Test 18: Error Cases"""
    print("\n" + "="*80)
    print("TEST 18: Error Cases")
    print("="*80)
    
    try:
        # Test 1: Non-existent membership code
        print("\n--- Test: Non-existent Membership ---")
        resp = requests.post(f"{BASE_URL}/events/booking", json={
            "centre_id": centre_id,
            "customer": "Test",
            "amount": 100000,
            "payment_method": "MEMBERSHIP",
            "redemption_ref": "INVALID-CODE"
        })
        passed_1 = resp.status_code == 400
        error_1 = resp.json().get('error', '')
        log_test("Non-existent membership rejected", passed_1, f"Error: {error_1}")
        
        # Test 2: Insufficient membership balance
        print("\n--- Test: Insufficient Membership Balance ---")
        # First create a small membership
        resp = requests.post(f"{BASE_URL}/events/membership", json={
            "centre_id": centre_id,
            "customer": "Small Member",
            "amount": 50000,
            "payment_method": "CASH"
        })
        assert resp.status_code == 200
        small_code = resp.json()['membership']['code']
        
        # Try to redeem more than available
        resp = requests.post(f"{BASE_URL}/events/booking", json={
            "centre_id": centre_id,
            "customer": "Small Member",
            "amount": 100000,
            "payment_method": "MEMBERSHIP",
            "redemption_ref": small_code
        })
        passed_2 = resp.status_code == 400
        error_2 = resp.json().get('error', '')
        log_test("Insufficient membership balance rejected", passed_2, f"Error: {error_2}")
        
        # Test 3: Invalid movement_type
        print("\n--- Test: Invalid Movement Type ---")
        resp = requests.post(f"{BASE_URL}/events/cash-movement", json={
            "centre_id": centre_id,
            "amount": 100000,
            "movement_type": "INVALID_TYPE"
        })
        passed_3 = resp.status_code == 400
        error_3 = resp.json().get('error', '')
        log_test("Invalid movement_type rejected", passed_3, f"Error: {error_3}")
        
        return passed_1 and passed_2 and passed_3
        
    except Exception as e:
        log_test("Error cases", False, str(e))
        raise

def main():
    print("\n" + "="*80)
    print("SPA ERP BACKEND COMPREHENSIVE TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    results = []
    
    try:
        # Test 1: Centres and Services
        centre = test_centres_and_services()
        results.append(("Centres & Services", True))
        
        # Test 2-11: End-to-end scenario
        centre_id, today, membership_code, gc_code = test_end_to_end_scenario(centre)
        results.append(("End-to-end scenario", True))
        
        # Test 12: Dashboard verification
        passed_dashboard = test_dashboard_verification(centre_id, today)
        results.append(("Dashboard verification", passed_dashboard))
        
        # Test 13: Memberships and gift cards
        passed_liabilities = test_memberships_and_gift_cards(membership_code, gc_code)
        results.append(("Memberships & Gift Cards", passed_liabilities))
        
        # Test 14: Master register
        passed_register = test_master_register(centre_id, today)
        results.append(("Master Register", passed_register))
        
        # Test 15: Cash book
        passed_cashbook = test_cash_book(centre_id, today)
        results.append(("Cash Book", passed_cashbook))
        
        # Test 16: Business day close/reopen
        passed_bizday = test_business_day_close_reopen(centre_id, today)
        results.append(("Business Day Close/Reopen", passed_bizday))
        
        # Test 17: Audit log
        passed_audit = test_audit_log()
        results.append(("Audit Log", passed_audit))
        
        # Test 18: Error cases
        passed_errors = test_error_cases(centre_id)
        results.append(("Error Cases", passed_errors))
        
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
    
    # Final summary
    print("\n" + "="*80)
    print("FINAL TEST SUMMARY")
    print("="*80)
    
    passed_count = sum(1 for _, passed in results if passed)
    total_count = len(results)
    
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed_count}/{total_count} tests passed")
    
    if passed_count == total_count:
        print("\n🎉 ALL TESTS PASSED! The financial engine is working correctly.")
    else:
        print(f"\n⚠️  {total_count - passed_count} test(s) failed. Review the details above.")
    
    print(f"\nTest Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    main()
