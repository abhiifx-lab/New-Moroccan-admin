#!/usr/bin/env python3
"""
Backend API Test Suite for Spa ERP - Audit & Investigation Module
Tests the newly-added endpoints:
1. GET /events/:id - enriched event detail
2. GET /drill-down - metric drill-down with breakdown
3. POST /events/:id/reverse - immutable reversal with semantic rules
"""

import requests
import json
from datetime import datetime

# Base URL from .env: NEXT_PUBLIC_BASE_URL + /api
BASE_URL = "https://multi-centre-spa-ops.preview.emergentagent.com/api"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_audit_investigation_module():
    """
    End-to-end test scenario for Audit & Investigation module.
    Uses business_date = "2030-01-15" to isolate from prior tests.
    """
    log("=" * 80)
    log("AUDIT & INVESTIGATION MODULE - COMPREHENSIVE TEST")
    log("=" * 80)
    
    # Get first centre
    log("\n[SETUP] Fetching centres...")
    resp = requests.get(f"{BASE_URL}/centres")
    assert resp.status_code == 200, f"Failed to get centres: {resp.status_code}"
    centres = resp.json()
    assert len(centres) > 0, "No centres found"
    centre = centres[0]
    centre_id = centre['id']
    log(f"✓ Using centre: {centre['name']} (ID: {centre_id})")
    
    # Test date - isolated from prior tests
    test_date = "2030-01-15"
    log(f"✓ Test date: {test_date}")
    
    # Store event IDs for later reference
    event_ids = {}
    membership_code = None
    gift_card_code = None
    
    # ========================================================================
    # STEP A: SEED EVENTS
    # ========================================================================
    log("\n" + "=" * 80)
    log("STEP A: SEED EVENTS ON 2030-01-15")
    log("=" * 80)
    
    # A1. Set opening cash
    log("\n[A1] Setting opening cash to 500000...")
    resp = requests.post(f"{BASE_URL}/business-day/set-opening", json={
        "centre_id": centre_id,
        "business_date": test_date,
        "opening_cash": 500000
    })
    assert resp.status_code == 200, f"Failed to set opening cash: {resp.status_code} - {resp.text}"
    log("✓ Opening cash set to 500000")
    
    # A2. Booking CASH 350000
    log("\n[A2] Creating CASH booking 350000 for Alpha...")
    resp = requests.post(f"{BASE_URL}/events/booking", json={
        "centre_id": centre_id,
        "business_date": test_date,
        "customer": "Alpha",
        "amount": 350000,
        "payment_method": "CASH",
        "created_by": "reception1",
        "role": "RECEPTION"
    })
    assert resp.status_code == 200, f"Failed to create booking: {resp.status_code} - {resp.text}"
    event_ids['A2_cash_booking'] = resp.json()['id']
    log(f"✓ CASH booking created: {event_ids['A2_cash_booking']}")
    
    # A3. Booking UPI 400000
    log("\n[A3] Creating UPI booking 400000 for Bravo...")
    resp = requests.post(f"{BASE_URL}/events/booking", json={
        "centre_id": centre_id,
        "business_date": test_date,
        "customer": "Bravo",
        "amount": 400000,
        "payment_method": "UPI",
        "created_by": "reception1",
        "role": "RECEPTION"
    })
    assert resp.status_code == 200, f"Failed to create booking: {resp.status_code} - {resp.text}"
    event_ids['A3_upi_booking'] = resp.json()['id']
    log(f"✓ UPI booking created: {event_ids['A3_upi_booking']}")
    
    # A4. Booking MIXED 350000
    log("\n[A4] Creating MIXED booking 350000 for Charlie...")
    resp = requests.post(f"{BASE_URL}/events/booking", json={
        "centre_id": centre_id,
        "business_date": test_date,
        "customer": "Charlie",
        "amount": 350000,
        "payment_method": "MIXED",
        "payment_breakdown": {"cash": 100000, "upi": 200000, "card": 50000},
        "created_by": "reception1",
        "role": "RECEPTION"
    })
    assert resp.status_code == 200, f"Failed to create booking: {resp.status_code} - {resp.text}"
    event_ids['A4_mixed_booking'] = resp.json()['id']
    log(f"✓ MIXED booking created: {event_ids['A4_mixed_booking']}")
    
    # A5. Sell membership 1000000 CASH to Delta
    log("\n[A5] Selling membership 1000000 CASH to Delta...")
    resp = requests.post(f"{BASE_URL}/events/membership", json={
        "centre_id": centre_id,
        "business_date": test_date,
        "customer": "Delta",
        "amount": 1000000,
        "payment_method": "CASH",
        "created_by": "reception1",
        "role": "RECEPTION"
    })
    assert resp.status_code == 200, f"Failed to create membership: {resp.status_code} - {resp.text}"
    data = resp.json()
    event_ids['A5_membership_sale'] = data['event']['id']
    membership_code = data['membership']['code']
    log(f"✓ Membership sale created: {event_ids['A5_membership_sale']}, code: {membership_code}")
    
    # A6. Sell gift card 500000 CASH from Echo to Foxtrot
    log("\n[A6] Selling gift card 500000 CASH from Echo to Foxtrot...")
    resp = requests.post(f"{BASE_URL}/events/gift-card", json={
        "centre_id": centre_id,
        "business_date": test_date,
        "customer": "Echo",
        "recipient": "Foxtrot",
        "amount": 500000,
        "payment_method": "CASH",
        "created_by": "reception1",
        "role": "RECEPTION"
    })
    assert resp.status_code == 200, f"Failed to create gift card: {resp.status_code} - {resp.text}"
    data = resp.json()
    event_ids['A6_gift_card_sale'] = data['event']['id']
    gift_card_code = data['gift_card']['code']
    log(f"✓ Gift card sale created: {event_ids['A6_gift_card_sale']}, code: {gift_card_code}")
    
    # A7. Booking 200000 MEMBERSHIP redeem using M1
    log("\n[A7] Creating MEMBERSHIP redemption booking 200000 for Delta...")
    resp = requests.post(f"{BASE_URL}/events/booking", json={
        "centre_id": centre_id,
        "business_date": test_date,
        "customer": "Delta",
        "amount": 200000,
        "payment_method": "MEMBERSHIP",
        "redemption_ref": membership_code,
        "created_by": "reception1",
        "role": "RECEPTION"
    })
    assert resp.status_code == 200, f"Failed to create membership redemption: {resp.status_code} - {resp.text}"
    event_ids['A7_membership_redemption'] = resp.json()['id']
    log(f"✓ Membership redemption created: {event_ids['A7_membership_redemption']}")
    
    # A8. Booking 150000 GIFT_CARD redeem using G1
    log("\n[A8] Creating GIFT_CARD redemption booking 150000 for Foxtrot...")
    resp = requests.post(f"{BASE_URL}/events/booking", json={
        "centre_id": centre_id,
        "business_date": test_date,
        "customer": "Foxtrot",
        "amount": 150000,
        "payment_method": "GIFT_CARD",
        "redemption_ref": gift_card_code,
        "created_by": "reception1",
        "role": "RECEPTION"
    })
    assert resp.status_code == 200, f"Failed to create gift card redemption: {resp.status_code} - {resp.text}"
    event_ids['A8_gift_card_redemption'] = resp.json()['id']
    log(f"✓ Gift card redemption created: {event_ids['A8_gift_card_redemption']}")
    
    # A9. Expense CASH 50000
    log("\n[A9] Creating CASH expense 50000 for Utilities...")
    resp = requests.post(f"{BASE_URL}/events/expense", json={
        "centre_id": centre_id,
        "business_date": test_date,
        "amount": 50000,
        "payment_method": "CASH",
        "category": "Utilities",
        "created_by": "reception1",
        "role": "RECEPTION"
    })
    assert resp.status_code == 200, f"Failed to create expense: {resp.status_code} - {resp.text}"
    event_ids['A9_expense'] = resp.json()['id']
    log(f"✓ Expense created: {event_ids['A9_expense']}")
    
    # A10. Cash movement BANK_DEPOSIT 200000
    log("\n[A10] Creating BANK_DEPOSIT 200000...")
    resp = requests.post(f"{BASE_URL}/events/cash-movement", json={
        "centre_id": centre_id,
        "business_date": test_date,
        "amount": 200000,
        "movement_type": "BANK_DEPOSIT",
        "created_by": "reception1",
        "role": "RECEPTION"
    })
    assert resp.status_code == 200, f"Failed to create cash movement: {resp.status_code} - {resp.text}"
    event_ids['A10_bank_deposit'] = resp.json()['id']
    log(f"✓ Bank deposit created: {event_ids['A10_bank_deposit']}")
    
    # A11. Cash movement FLOAT_ADDED 100000
    log("\n[A11] Creating FLOAT_ADDED 100000...")
    resp = requests.post(f"{BASE_URL}/events/cash-movement", json={
        "centre_id": centre_id,
        "business_date": test_date,
        "amount": 100000,
        "movement_type": "FLOAT_ADDED",
        "created_by": "reception1",
        "role": "RECEPTION"
    })
    assert resp.status_code == 200, f"Failed to create cash movement: {resp.status_code} - {resp.text}"
    event_ids['A11_float_added'] = resp.json()['id']
    log(f"✓ Float added created: {event_ids['A11_float_added']}")
    
    log("\n✓ STEP A COMPLETE: All 11 events seeded successfully")
    
    # ========================================================================
    # STEP B: BASELINE VERIFICATION
    # ========================================================================
    log("\n" + "=" * 80)
    log("STEP B: BASELINE VERIFICATION (BEFORE REVERSALS)")
    log("=" * 80)
    
    log("\n[B] Fetching dashboard for baseline verification...")
    resp = requests.get(f"{BASE_URL}/dashboard", params={
        "centre_id": centre_id,
        "date": test_date
    })
    assert resp.status_code == 200, f"Failed to get dashboard: {resp.status_code} - {resp.text}"
    dashboard = resp.json()['agg']
    
    # Expected values
    expected = {
        "total_revenue": 2600000,  # 1100000 + 1000000 + 500000
        "booking_sales": 1100000,  # 350000 + 400000 + 350000
        "membership_sales": 1000000,
        "gift_card_sales": 500000,
        "cash_sales": 1950000,  # 350000 + 100000 + 1000000 + 500000
        "upi_sales": 600000,  # 400000 + 200000
        "card_sales": 50000,
        "total_expenses": 50000,
        "cash_expenses": 50000,
        "cash_deposited": 200000,
        "float_added": 100000,
        "bookings": 5,
        "redemptions": 2,
        "guests": 6,  # Alpha, Bravo, Charlie, Delta, Echo, Foxtrot
        "closing_cash_expected": 2300000  # 500000 + 1950000 + 100000 - 50000 - 200000
    }
    
    log("\nVerifying dashboard metrics:")
    all_passed = True
    for key, expected_val in expected.items():
        actual_val = dashboard.get(key, 0)
        status = "✓" if actual_val == expected_val else "✗"
        if actual_val != expected_val:
            all_passed = False
            log(f"  {status} {key}: expected {expected_val}, got {actual_val} ❌")
        else:
            log(f"  {status} {key}: {actual_val}")
    
    assert all_passed, "❌ BASELINE VERIFICATION FAILED - Dashboard metrics don't match expected values"
    log("\n✓ STEP B COMPLETE: All baseline metrics verified")
    
    # ========================================================================
    # STEP C: DRILL-DOWN VALIDATION
    # ========================================================================
    log("\n" + "=" * 80)
    log("STEP C: DRILL-DOWN VALIDATION FOR ALL METRICS")
    log("=" * 80)
    
    metrics_to_test = [
        "total_revenue", "booking_sales", "membership_sales", "gift_card_sales",
        "cash_sales", "upi_sales", "card_sales", "total_expenses", "cash_expenses",
        "cash_deposited", "float_added", "bookings", "redemptions",
        "memberships_sold", "gift_cards_sold", "guests", "net_profit"
    ]
    
    drill_down_results = {}
    for metric in metrics_to_test:
        log(f"\n[C] Testing drill-down for metric: {metric}")
        resp = requests.get(f"{BASE_URL}/drill-down", params={
            "metric": metric,
            "centre_id": centre_id,
            "date": test_date
        })
        assert resp.status_code == 200, f"Failed to get drill-down for {metric}: {resp.status_code} - {resp.text}"
        data = resp.json()
        drill_down_results[metric] = data
        
        # Verify total matches dashboard (except for metrics not in dashboard)
        if metric in expected:
            dashboard_val = expected[metric]
            drill_total = data['total']
            if drill_total == dashboard_val:
                log(f"  ✓ Total matches dashboard: {drill_total}")
            else:
                log(f"  ✗ Total mismatch: drill-down={drill_total}, dashboard={dashboard_val} ❌")
                assert False, f"Drill-down total mismatch for {metric}"
        
        # Verify events contributions sum to total
        events_sum = sum(e['contribution'] for e in data['events'])
        if events_sum == data['total']:
            log(f"  ✓ Events contributions sum to total: {events_sum}")
        else:
            log(f"  ✗ Events sum mismatch: sum={events_sum}, total={data['total']} ❌")
            assert False, f"Events contributions don't sum to total for {metric}"
        
        # Verify breakdown by type
        breakdown = data.get('breakdown', {})
        breakdown_total = sum(b['total'] for b in breakdown.values())
        log(f"  ✓ Breakdown by type: {len(breakdown)} types, total={breakdown_total}")
        log(f"  ✓ Events count: {len(data['events'])}")
    
    log("\n✓ STEP C COMPLETE: All drill-down validations passed")
    
    # ========================================================================
    # STEP D: ENRICHED EVENT DETAIL
    # ========================================================================
    log("\n" + "=" * 80)
    log("STEP D: ENRICHED EVENT DETAIL")
    log("=" * 80)
    
    # D1. Test CASH booking A2
    log(f"\n[D1] Testing enriched detail for CASH booking A2...")
    resp = requests.get(f"{BASE_URL}/events/{event_ids['A2_cash_booking']}")
    assert resp.status_code == 200, f"Failed to get event detail: {resp.status_code} - {resp.text}"
    event_detail = resp.json()
    
    # Verify centre is included
    assert 'centre' in event_detail, "Centre not included in event detail"
    assert event_detail['centre']['name'] == centre['name'], "Centre name mismatch"
    log(f"  ✓ Centre included: {event_detail['centre']['name']}")
    
    # Verify audit_history
    assert 'audit_history' in event_detail, "Audit history not included"
    assert len(event_detail['audit_history']) > 0, "Audit history is empty"
    assert any(a['action'] == 'CREATE_EVENT' for a in event_detail['audit_history']), "CREATE_EVENT not in audit history"
    log(f"  ✓ Audit history included: {len(event_detail['audit_history'])} entries")
    
    # Verify ledger_impact
    assert 'ledger_impact' in event_detail, "Ledger impact not included"
    ledger = event_detail['ledger_impact']
    assert ledger['revenue'] == 350000, f"Revenue mismatch: {ledger['revenue']}"
    assert ledger['expense'] == 0, f"Expense should be 0: {ledger['expense']}"
    assert ledger['cash'] == 350000, f"Cash mismatch: {ledger['cash']}"
    assert ledger['upi'] == 0, f"UPI should be 0: {ledger['upi']}"
    assert ledger['card'] == 0, f"Card should be 0: {ledger['card']}"
    assert ledger['liability_delta'] == 0, f"Liability delta should be 0: {ledger['liability_delta']}"
    log(f"  ✓ Ledger impact verified: revenue=350000, cash=350000")
    
    # D2. Test MIXED booking A4
    log(f"\n[D2] Testing enriched detail for MIXED booking A4...")
    resp = requests.get(f"{BASE_URL}/events/{event_ids['A4_mixed_booking']}")
    assert resp.status_code == 200, f"Failed to get event detail: {resp.status_code} - {resp.text}"
    event_detail = resp.json()
    ledger = event_detail['ledger_impact']
    assert ledger['cash'] == 100000, f"Cash mismatch: {ledger['cash']}"
    assert ledger['upi'] == 200000, f"UPI mismatch: {ledger['upi']}"
    assert ledger['card'] == 50000, f"Card mismatch: {ledger['card']}"
    assert ledger['revenue'] == 350000, f"Revenue mismatch: {ledger['revenue']}"
    log(f"  ✓ MIXED booking ledger verified: cash=100000, upi=200000, card=50000, revenue=350000")
    
    # D3. Test MEMBERSHIP_SALE A5
    log(f"\n[D3] Testing enriched detail for MEMBERSHIP_SALE A5...")
    resp = requests.get(f"{BASE_URL}/events/{event_ids['A5_membership_sale']}")
    assert resp.status_code == 200, f"Failed to get event detail: {resp.status_code} - {resp.text}"
    event_detail = resp.json()
    ledger = event_detail['ledger_impact']
    assert ledger['liability_delta'] == 1000000, f"Liability delta mismatch: {ledger['liability_delta']}"
    assert 'membership' in event_detail, "Membership not linked"
    # After A7 redemption, remaining should be 800000
    assert event_detail['membership']['remaining_paise'] == 800000, f"Membership balance mismatch: {event_detail['membership']['remaining_paise']}"
    log(f"  ✓ Membership sale ledger verified: liability_delta=1000000, remaining=800000")
    
    # D4. Test BOOKING with MEMBERSHIP redemption A7
    log(f"\n[D4] Testing enriched detail for MEMBERSHIP redemption A7...")
    resp = requests.get(f"{BASE_URL}/events/{event_ids['A7_membership_redemption']}")
    assert resp.status_code == 200, f"Failed to get event detail: {resp.status_code} - {resp.text}"
    event_detail = resp.json()
    ledger = event_detail['ledger_impact']
    assert ledger['revenue'] == 0, f"Revenue should be 0 for redemption: {ledger['revenue']}"
    assert ledger['liability_delta'] == -200000, f"Liability delta mismatch: {ledger['liability_delta']}"
    assert 'membership' in event_detail, "Membership not linked"
    log(f"  ✓ Membership redemption ledger verified: revenue=0, liability_delta=-200000")
    
    log("\n✓ STEP D COMPLETE: All enriched event details verified")
    
    # ========================================================================
    # STEP E: REVERSE CASH BOOKING
    # ========================================================================
    log("\n" + "=" * 80)
    log("STEP E: REVERSE CASH BOOKING A2")
    log("=" * 80)
    
    # E1. Try to reverse without reason
    log("\n[E1] Testing reversal without reason (should fail)...")
    resp = requests.post(f"{BASE_URL}/events/{event_ids['A2_cash_booking']}/reverse", json={})
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
    assert "reason" in resp.text.lower() and "mandatory" in resp.text.lower(), "Error message should mention mandatory reason"
    log(f"  ✓ Correctly rejected: {resp.json()['error']}")
    
    # E2. Reverse with reason
    log("\n[E2] Reversing CASH booking A2 with reason...")
    resp = requests.post(f"{BASE_URL}/events/{event_ids['A2_cash_booking']}/reverse", json={
        "reason": "customer no-show",
        "actor": "reception1",
        "role": "RECEPTION"
    })
    assert resp.status_code == 200, f"Failed to reverse event: {resp.status_code} - {resp.text}"
    reversal_data = resp.json()
    assert 'reversal_event' in reversal_data, "Reversal event not returned"
    reversal_event_id = reversal_data['reversal_event']['id']
    log(f"  ✓ Reversal created: {reversal_event_id}")
    
    # E3. Verify dashboard after reversal
    log("\n[E3] Verifying dashboard after reversal...")
    resp = requests.get(f"{BASE_URL}/dashboard", params={
        "centre_id": centre_id,
        "date": test_date
    })
    assert resp.status_code == 200, f"Failed to get dashboard: {resp.status_code} - {resp.text}"
    dashboard = resp.json()['agg']
    
    expected_after_e2 = {
        "total_revenue": 2250000,  # 2600000 - 350000
        "booking_sales": 750000,  # 1100000 - 350000
        "cash_sales": 1600000,  # 1950000 - 350000
        "closing_cash_expected": 1950000,  # 2300000 - 350000
        "bookings": 4  # 5 - 1
    }
    
    log("  Verifying metrics after reversal:")
    for key, expected_val in expected_after_e2.items():
        actual_val = dashboard.get(key, 0)
        status = "✓" if actual_val == expected_val else "✗"
        if actual_val != expected_val:
            log(f"    {status} {key}: expected {expected_val}, got {actual_val} ❌")
            assert False, f"Dashboard metric {key} mismatch after reversal"
        else:
            log(f"    {status} {key}: {actual_val}")
    
    # E4. Verify drill-down includes both original and reversal
    log("\n[E4] Verifying drill-down includes original and reversal events...")
    resp = requests.get(f"{BASE_URL}/drill-down", params={
        "metric": "booking_sales",
        "centre_id": centre_id,
        "date": test_date
    })
    assert resp.status_code == 200, f"Failed to get drill-down: {resp.status_code} - {resp.text}"
    drill_data = resp.json()
    
    # Find original and reversal in events
    original_found = False
    reversal_found = False
    for item in drill_data['events']:
        if item['event']['id'] == event_ids['A2_cash_booking']:
            original_found = True
            assert item['contribution'] == 350000, f"Original contribution should be 350000: {item['contribution']}"
        if item['event']['id'] == reversal_event_id:
            reversal_found = True
            assert item['contribution'] == -350000, f"Reversal contribution should be -350000: {item['contribution']}"
    
    assert original_found, "Original event not found in drill-down"
    assert reversal_found, "Reversal event not found in drill-down"
    assert drill_data['total'] == 750000, f"Drill-down total should be 750000: {drill_data['total']}"
    log(f"  ✓ Drill-down verified: total=750000, includes both original (+350000) and reversal (-350000)")
    
    # E5. Try to reverse the same event again
    log("\n[E5] Testing double reversal (should fail)...")
    resp = requests.post(f"{BASE_URL}/events/{event_ids['A2_cash_booking']}/reverse", json={
        "reason": "test double reversal",
        "actor": "reception1",
        "role": "RECEPTION"
    })
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
    assert "already reversed" in resp.text.lower(), "Error message should mention already reversed"
    log(f"  ✓ Correctly rejected: {resp.json()['error']}")
    
    # E6. Try to reverse the reversal event
    log("\n[E6] Testing reversal of reversal event (should fail)...")
    resp = requests.post(f"{BASE_URL}/events/{reversal_event_id}/reverse", json={
        "reason": "test reversal of reversal",
        "actor": "reception1",
        "role": "RECEPTION"
    })
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
    assert "cannot reverse a reversal" in resp.text.lower(), "Error message should mention cannot reverse reversal"
    log(f"  ✓ Correctly rejected: {resp.json()['error']}")
    
    # E7. Verify audit log
    log("\n[E7] Verifying audit log for reversal...")
    resp = requests.get(f"{BASE_URL}/audit-log", params={
        "target_event_id": event_ids['A2_cash_booking']
    })
    assert resp.status_code == 200, f"Failed to get audit log: {resp.status_code} - {resp.text}"
    audit_entries = resp.json()
    
    reverse_entry = None
    for entry in audit_entries:
        if entry['action'] == 'REVERSE_EVENT':
            reverse_entry = entry
            break
    
    assert reverse_entry is not None, "REVERSE_EVENT entry not found in audit log"
    assert reverse_entry.get('reason') == "customer no-show", "Reason not recorded in audit log"
    assert reverse_entry.get('reversal_event_id') == reversal_event_id, "Reversal event ID not recorded"
    log(f"  ✓ Audit log verified: REVERSE_EVENT entry found with reason and reversal_event_id")
    
    # E8. Verify original event has reversal metadata
    log("\n[E8] Verifying original event has reversal metadata...")
    resp = requests.get(f"{BASE_URL}/events/{event_ids['A2_cash_booking']}")
    assert resp.status_code == 200, f"Failed to get event: {resp.status_code} - {resp.text}"
    original_event = resp.json()
    
    assert original_event.get('reversed_by_event_id') == reversal_event_id, "reversed_by_event_id not set"
    assert 'reversal_event' in original_event, "reversal_event not included in response"
    log(f"  ✓ Original event metadata verified: reversed_by_event_id set, reversal_event included")
    
    log("\n✓ STEP E COMPLETE: All reversal validations passed")
    
    # ========================================================================
    # STEP F: REVERSE MEMBERSHIP_SALE
    # ========================================================================
    log("\n" + "=" * 80)
    log("STEP F: REVERSE MEMBERSHIP_SALE A5")
    log("=" * 80)
    
    # F1. Reverse membership sale
    log("\n[F1] Reversing MEMBERSHIP_SALE A5...")
    resp = requests.post(f"{BASE_URL}/events/{event_ids['A5_membership_sale']}/reverse", json={
        "reason": "data entry error",
        "actor": "manager1",
        "role": "MANAGER"
    })
    assert resp.status_code == 200, f"Failed to reverse membership sale: {resp.status_code} - {resp.text}"
    log(f"  ✓ Membership sale reversed")
    
    # F2. Verify membership is marked as reversed
    log("\n[F2] Verifying membership is marked as reversed...")
    resp = requests.get(f"{BASE_URL}/memberships/{membership_code}")
    assert resp.status_code == 200, f"Failed to get membership: {resp.status_code} - {resp.text}"
    membership = resp.json()
    
    assert membership['reversed'] == True, f"Membership not marked as reversed: {membership.get('reversed')}"
    assert membership['active'] == False, f"Membership still active: {membership.get('active')}"
    assert membership['remaining_paise'] == 0, f"Membership balance not zeroed: {membership.get('remaining_paise')}"
    log(f"  ✓ Membership verified: reversed=True, active=False, remaining_paise=0")
    
    # F3. Try to create booking with reversed membership
    log("\n[F3] Testing booking with reversed membership (should fail)...")
    resp = requests.post(f"{BASE_URL}/events/booking", json={
        "centre_id": centre_id,
        "business_date": test_date,
        "customer": "Delta",
        "amount": 100000,
        "payment_method": "MEMBERSHIP",
        "redemption_ref": membership_code,
        "created_by": "reception1",
        "role": "RECEPTION"
    })
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
    assert "reversed" in resp.text.lower(), "Error message should mention reversed membership"
    log(f"  ✓ Correctly rejected: {resp.json()['error']}")
    
    # F4. Verify dashboard after membership reversal
    log("\n[F4] Verifying dashboard after membership reversal...")
    resp = requests.get(f"{BASE_URL}/dashboard", params={
        "centre_id": centre_id,
        "date": test_date
    })
    assert resp.status_code == 200, f"Failed to get dashboard: {resp.status_code} - {resp.text}"
    dashboard = resp.json()['agg']
    
    # membership_sales should be 0, cash_sales should drop by 1000000
    assert dashboard['membership_sales'] == 0, f"Membership sales should be 0: {dashboard['membership_sales']}"
    assert dashboard['cash_sales'] == 600000, f"Cash sales should be 600000: {dashboard['cash_sales']}"  # 1600000 - 1000000
    assert dashboard['closing_cash_expected'] == 950000, f"Closing cash should be 950000: {dashboard['closing_cash_expected']}"  # 1950000 - 1000000
    log(f"  ✓ Dashboard verified: membership_sales=0, cash_sales=600000, closing_cash=950000")
    
    log("\n✓ STEP F COMPLETE: Membership reversal validated")
    
    # ========================================================================
    # STEP G: REVERSE BOOKING WITH GIFT_CARD REDEMPTION
    # ========================================================================
    log("\n" + "=" * 80)
    log("STEP G: REVERSE BOOKING WITH GIFT_CARD REDEMPTION A8")
    log("=" * 80)
    
    # G1. Check gift card balance before reversal
    log("\n[G1] Checking gift card balance before reversal...")
    resp = requests.get(f"{BASE_URL}/gift-cards/{gift_card_code}")
    assert resp.status_code == 200, f"Failed to get gift card: {resp.status_code} - {resp.text}"
    gift_card = resp.json()
    assert gift_card['remaining_paise'] == 350000, f"Gift card balance should be 350000: {gift_card['remaining_paise']}"
    log(f"  ✓ Gift card balance before reversal: {gift_card['remaining_paise']}")
    
    # G2. Reverse gift card redemption booking
    log("\n[G2] Reversing GIFT_CARD redemption booking A8...")
    resp = requests.post(f"{BASE_URL}/events/{event_ids['A8_gift_card_redemption']}/reverse", json={
        "reason": "wrong card scanned",
        "actor": "reception2",
        "role": "RECEPTION"
    })
    assert resp.status_code == 200, f"Failed to reverse gift card redemption: {resp.status_code} - {resp.text}"
    log(f"  ✓ Gift card redemption reversed")
    
    # G3. Verify gift card balance is restored
    log("\n[G3] Verifying gift card balance is restored...")
    resp = requests.get(f"{BASE_URL}/gift-cards/{gift_card_code}")
    assert resp.status_code == 200, f"Failed to get gift card: {resp.status_code} - {resp.text}"
    gift_card = resp.json()
    assert gift_card['remaining_paise'] == 500000, f"Gift card balance should be restored to 500000: {gift_card['remaining_paise']}"
    log(f"  ✓ Gift card balance restored: {gift_card['remaining_paise']}")
    
    # G4. Verify redemption_count decremented
    log("\n[G4] Verifying redemption_count decremented...")
    assert gift_card['redemption_count'] == 0, f"Redemption count should be 0: {gift_card['redemption_count']}"
    log(f"  ✓ Redemption count: {gift_card['redemption_count']}")
    
    # G5. Verify dashboard redemptions count
    log("\n[G5] Verifying dashboard redemptions count...")
    resp = requests.get(f"{BASE_URL}/dashboard", params={
        "centre_id": centre_id,
        "date": test_date
    })
    assert resp.status_code == 200, f"Failed to get dashboard: {resp.status_code} - {resp.text}"
    dashboard = resp.json()['agg']
    assert dashboard['redemptions'] == 1, f"Redemptions should be 1: {dashboard['redemptions']}"  # 2 - 1
    log(f"  ✓ Dashboard redemptions: {dashboard['redemptions']}")
    
    log("\n✓ STEP G COMPLETE: Gift card redemption reversal validated")
    
    # ========================================================================
    # STEP H: BUSINESS DAY CLOSED + ROLE GATE
    # ========================================================================
    log("\n" + "=" * 80)
    log("STEP H: BUSINESS DAY CLOSED + ROLE GATE")
    log("=" * 80)
    
    # H1. Close business day
    log("\n[H1] Closing business day...")
    resp = requests.post(f"{BASE_URL}/business-day/close", json={
        "centre_id": centre_id,
        "business_date": test_date,
        "closing_cash_declared": 0,
        "actor": "reception",
        "role": "RECEPTION"
    })
    assert resp.status_code == 200, f"Failed to close business day: {resp.status_code} - {resp.text}"
    log(f"  ✓ Business day closed")
    
    # H2. Try to reverse with RECEPTION role (should fail)
    log("\n[H2] Testing reversal with RECEPTION role on closed day (should fail)...")
    resp = requests.post(f"{BASE_URL}/events/{event_ids['A3_upi_booking']}/reverse", json={
        "reason": "test closed day",
        "actor": "reception1",
        "role": "RECEPTION"
    })
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
    assert "closed" in resp.text.lower() and "manager" in resp.text.lower(), "Error message should mention closed day and manager approval"
    log(f"  ✓ Correctly rejected: {resp.json()['error']}")
    
    # H3. Reverse with MANAGER role (should succeed)
    log("\n[H3] Reversing with MANAGER role on closed day...")
    resp = requests.post(f"{BASE_URL}/events/{event_ids['A3_upi_booking']}/reverse", json={
        "reason": "manager override",
        "actor": "mgr",
        "role": "MANAGER"
    })
    assert resp.status_code == 200, f"Failed to reverse with MANAGER role: {resp.status_code} - {resp.text}"
    log(f"  ✓ Reversal succeeded with MANAGER role")
    
    # H4. Verify dashboard UPI sales decreased
    log("\n[H4] Verifying dashboard UPI sales decreased...")
    resp = requests.get(f"{BASE_URL}/dashboard", params={
        "centre_id": centre_id,
        "date": test_date
    })
    assert resp.status_code == 200, f"Failed to get dashboard: {resp.status_code} - {resp.text}"
    dashboard = resp.json()['agg']
    assert dashboard['upi_sales'] == 200000, f"UPI sales should be 200000: {dashboard['upi_sales']}"  # 600000 - 400000
    log(f"  ✓ Dashboard UPI sales: {dashboard['upi_sales']}")
    
    log("\n✓ STEP H COMPLETE: Business day closed + role gate validated")
    
    # ========================================================================
    # STEP I: CASH-BOOK AFTER REVERSALS
    # ========================================================================
    log("\n" + "=" * 80)
    log("STEP I: CASH-BOOK AFTER REVERSALS")
    log("=" * 80)
    
    log("\n[I] Fetching cash-book...")
    resp = requests.get(f"{BASE_URL}/cash-book", params={
        "centre_id": centre_id,
        "date": test_date
    })
    assert resp.status_code == 200, f"Failed to get cash-book: {resp.status_code} - {resp.text}"
    cash_book = resp.json()
    
    lines = cash_book['lines']
    agg = cash_book['agg']
    
    # Verify last line running balance equals closing_cash_expected
    last_line = lines[-1]
    assert last_line['running'] == agg['closing_cash_expected'], \
        f"Last running balance {last_line['running']} != closing_cash_expected {agg['closing_cash_expected']}"
    log(f"  ✓ Last running balance matches closing_cash_expected: {last_line['running']}")
    
    # Verify reversal lines are present
    reversal_lines = [line for line in lines if line.get('is_reversal')]
    assert len(reversal_lines) > 0, "No reversal lines found in cash-book"
    log(f"  ✓ Reversal lines present in cash-book: {len(reversal_lines)} lines")
    
    log("\n✓ STEP I COMPLETE: Cash-book validated")
    
    # ========================================================================
    # FINAL SUMMARY
    # ========================================================================
    log("\n" + "=" * 80)
    log("✅ ALL TESTS PASSED - AUDIT & INVESTIGATION MODULE WORKING CORRECTLY")
    log("=" * 80)
    log("\nSummary:")
    log("  ✓ Step A: 11 events seeded successfully")
    log("  ✓ Step B: Baseline dashboard metrics verified")
    log("  ✓ Step C: Drill-down for all metrics validated")
    log("  ✓ Step D: Enriched event details verified")
    log("  ✓ Step E: CASH booking reversal validated")
    log("  ✓ Step F: Membership sale reversal validated")
    log("  ✓ Step G: Gift card redemption reversal validated")
    log("  ✓ Step H: Business day closed + role gate validated")
    log("  ✓ Step I: Cash-book after reversals validated")
    log("\n" + "=" * 80)

if __name__ == "__main__":
    try:
        test_audit_investigation_module()
        print("\n✅ TEST SUITE COMPLETED SUCCESSFULLY")
        exit(0)
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        exit(1)
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
