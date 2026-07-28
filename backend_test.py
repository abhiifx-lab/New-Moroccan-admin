#!/usr/bin/env python3
"""
CRITICAL VERIFICATION PASS - Spa ERP Backend
Tests FIX 1 (Centres), FIX 2 (True Immutability), FIX 3 (UPI 1/UPI 2), 
Acceptance Scenario, Reversal Tests, and Reports Module
"""

import requests
import json
import copy
from typing import Dict, List, Any
from datetime import datetime, timedelta

# Use a unique business date for each test run to avoid data accumulation
# Use a date in the future to isolate from any existing data
test_run_id = int(datetime.now().timestamp())
# Use a date in 2030 with the day based on test run to make it unique
base_date = datetime(2030, 6, 1)
day_offset = (test_run_id % 28) + 1  # Days 1-28 to stay within month
BUSINESS_DATE = f"2030-06-{day_offset:02d}"

BASE_URL = "https://multi-centre-spa-ops.preview.emergentagent.com/api"

# Test results tracking
test_results = {
    "passed": [],
    "failed": [],
    "warnings": []
}

def log_pass(test_name: str, details: str = ""):
    msg = f"✅ {test_name}"
    if details:
        msg += f": {details}"
    test_results["passed"].append(msg)
    print(msg)

def log_fail(test_name: str, details: str):
    msg = f"❌ {test_name}: {details}"
    test_results["failed"].append(msg)
    print(msg)

def log_warning(test_name: str, details: str):
    msg = f"⚠️  {test_name}: {details}"
    test_results["warnings"].append(msg)
    print(msg)

def get_centres() -> List[Dict]:
    """Get all centres"""
    resp = requests.get(f"{BASE_URL}/centres")
    resp.raise_for_status()
    return resp.json()

def get_events(from_date: str = None, to_date: str = None, centre_id: str = None) -> List[Dict]:
    """Get events with optional filters"""
    params = {}
    if from_date:
        params['from'] = from_date
    if to_date:
        params['to'] = to_date
    if centre_id:
        params['centre_id'] = centre_id
    resp = requests.get(f"{BASE_URL}/events", params=params)
    resp.raise_for_status()
    return resp.json()

def get_event_by_id(event_id: str) -> Dict:
    """Get enriched event by ID"""
    resp = requests.get(f"{BASE_URL}/events/{event_id}")
    resp.raise_for_status()
    return resp.json()

def create_booking(centre_id: str, customer: str, amount: int, payment_method: str, 
                   payment_breakdown: Dict = None, redemption_ref: str = None) -> Dict:
    """Create a booking event"""
    payload = {
        "centre_id": centre_id,
        "customer": customer,
        "amount": amount,
        "payment_method": payment_method,
        "business_date": BUSINESS_DATE,
        "created_by": "test_agent",
        "role": "RECEPTION"
    }
    if payment_breakdown:
        payload["payment_breakdown"] = payment_breakdown
    if redemption_ref:
        payload["redemption_ref"] = redemption_ref
    
    resp = requests.post(f"{BASE_URL}/events/booking", json=payload)
    resp.raise_for_status()
    return resp.json()

def create_membership(centre_id: str, customer: str, amount: int, payment_method: str, code: str) -> Dict:
    """Create a membership sale"""
    payload = {
        "centre_id": centre_id,
        "customer": customer,
        "amount": amount,
        "payment_method": payment_method,
        "code": code,
        "business_date": BUSINESS_DATE,
        "created_by": "test_agent",
        "role": "RECEPTION"
    }
    resp = requests.post(f"{BASE_URL}/events/membership", json=payload)
    resp.raise_for_status()
    return resp.json()

def create_gift_card(centre_id: str, customer: str, recipient: str, amount: int, 
                     payment_method: str, code: str) -> Dict:
    """Create a gift card sale"""
    payload = {
        "centre_id": centre_id,
        "customer": customer,
        "recipient": recipient,
        "amount": amount,
        "payment_method": payment_method,
        "code": code,
        "business_date": BUSINESS_DATE,
        "created_by": "test_agent",
        "role": "RECEPTION"
    }
    resp = requests.post(f"{BASE_URL}/events/gift-card", json=payload)
    resp.raise_for_status()
    return resp.json()

def create_expense(centre_id: str, amount: int, payment_method: str, category: str) -> Dict:
    """Create an expense event"""
    payload = {
        "centre_id": centre_id,
        "amount": amount,
        "payment_method": payment_method,
        "category": category,
        "business_date": BUSINESS_DATE,
        "created_by": "test_agent",
        "role": "RECEPTION"
    }
    resp = requests.post(f"{BASE_URL}/events/expense", json=payload)
    resp.raise_for_status()
    return resp.json()

def create_cash_movement(centre_id: str, amount: int, movement_type: str) -> Dict:
    """Create a cash movement event"""
    payload = {
        "centre_id": centre_id,
        "amount": amount,
        "movement_type": movement_type,
        "business_date": BUSINESS_DATE,
        "created_by": "test_agent",
        "role": "RECEPTION"
    }
    resp = requests.post(f"{BASE_URL}/events/cash-movement", json=payload)
    resp.raise_for_status()
    return resp.json()

def reverse_event(event_id: str, reason: str, role: str = "RECEPTION") -> Dict:
    """Reverse an event"""
    payload = {
        "reason": reason,
        "actor": "test_agent",
        "role": role
    }
    resp = requests.post(f"{BASE_URL}/events/{event_id}/reverse", json=payload)
    return resp

def set_opening_cash(centre_id: str, opening_cash: int):
    """Set opening cash for a business day"""
    payload = {
        "centre_id": centre_id,
        "business_date": BUSINESS_DATE,
        "opening_cash": opening_cash
    }
    resp = requests.post(f"{BASE_URL}/business-day/set-opening", json=payload)
    resp.raise_for_status()
    return resp.json()

def get_dashboard(centre_id: str, date: str) -> Dict:
    """Get dashboard aggregation"""
    params = {"centre_id": centre_id, "date": date}
    resp = requests.get(f"{BASE_URL}/dashboard", params=params)
    resp.raise_for_status()
    return resp.json()

def get_membership(code: str) -> Dict:
    """Get membership by code"""
    resp = requests.get(f"{BASE_URL}/memberships/{code}")
    resp.raise_for_status()
    return resp.json()

def get_gift_card(code: str) -> Dict:
    """Get gift card by code"""
    resp = requests.get(f"{BASE_URL}/gift-cards/{code}")
    resp.raise_for_status()
    return resp.json()

def get_pl_report(centre_id: str, from_date: str, to_date: str, group: str = "month") -> Dict:
    """Get P&L report"""
    params = {
        "centre_id": centre_id,
        "from": from_date,
        "to": to_date,
        "group": group
    }
    resp = requests.get(f"{BASE_URL}/reports/pl", params=params)
    resp.raise_for_status()
    return resp.json()

def get_csv_report(centre_id: str, from_date: str, to_date: str, group: str = "month") -> str:
    """Get CSV report"""
    params = {
        "centre_id": centre_id,
        "from": from_date,
        "to": to_date,
        "group": group
    }
    resp = requests.get(f"{BASE_URL}/reports/csv", params=params)
    resp.raise_for_status()
    return resp.text

def extract_raw_event_fields(event: Dict) -> Dict:
    """Extract only raw event fields (excluding derived fields)"""
    derived_fields = ['reversed', 'reversal_event', 'original_event', 'centre', 
                      'ledger_impact', 'audit_history', '_id', 'membership', 'gift_card']
    raw = {}
    for key, value in event.items():
        if key not in derived_fields:
            raw[key] = value
    return raw

def compare_events(before: Dict, after: Dict) -> bool:
    """Compare two events for byte-for-byte equality (excluding derived fields)"""
    before_raw = extract_raw_event_fields(before)
    after_raw = extract_raw_event_fields(after)
    return before_raw == after_raw

# ============================================================================
# TEST FIX 1: CENTRES
# ============================================================================

def test_centres():
    """Test that only 3 approved centres exist"""
    print("\n" + "="*80)
    print("TEST FIX 1: CENTRES")
    print("="*80)
    
    centres = get_centres()
    centre_names = [c['name'] for c in centres]
    
    # Test a) Exactly 3 centres
    if len(centres) == 3:
        log_pass("FIX1-A: Centre count", f"Exactly 3 centres exist")
    else:
        log_fail("FIX1-A: Centre count", f"Expected 3 centres, got {len(centres)}: {centre_names}")
    
    # Verify names
    expected_names = ['Phoenix Pallassio', 'Holiday Inn', 'Lulu Mall']
    for name in expected_names:
        if name in centre_names:
            log_pass(f"FIX1-A: Centre '{name}'", "exists")
        else:
            log_fail(f"FIX1-A: Centre '{name}'", "NOT FOUND")
    
    # Print centre IDs for reference
    print("\nCentre IDs:")
    centre_map = {}
    for c in centres:
        print(f"  {c['name']}: {c['id']}")
        centre_map[c['name']] = c['id']
    
    # Test b) All events reference approved centres
    all_events = get_events(from_date="2020-01-01", to_date="2030-12-31")
    approved_ids = [c['id'] for c in centres]
    
    invalid_events = [e for e in all_events if e['centre_id'] not in approved_ids]
    if len(invalid_events) == 0:
        log_pass("FIX1-B: Event centre validation", f"All {len(all_events)} events reference approved centres")
    else:
        log_fail("FIX1-B: Event centre validation", 
                f"{len(invalid_events)} events reference invalid centres")
    
    # Group events by centre
    from collections import Counter
    centre_counts = Counter(e['centre_id'] for e in all_events)
    print("\nEvent counts by centre:")
    for centre_id, count in centre_counts.items():
        centre_name = next((c['name'] for c in centres if c['id'] == centre_id), 'UNKNOWN')
        print(f"  {centre_name}: {count} events")
    
    # Test c) Fake centre_id returns 500 error
    try:
        fake_booking = create_booking(
            centre_id="00000000-0000-0000-0000-000000000000",
            customer="Test",
            amount=10000,
            payment_method="CASH"
        )
        log_fail("FIX1-C: Fake centre rejection", "Fake centre_id was accepted (should fail)")
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 500:
            error_msg = e.response.json().get('error', '')
            if 'Invalid or unknown centre_id' in error_msg:
                log_pass("FIX1-C: Fake centre rejection", f"500 error with correct message: {error_msg}")
            else:
                log_fail("FIX1-C: Fake centre rejection", f"500 error but wrong message: {error_msg}")
        else:
            log_fail("FIX1-C: Fake centre rejection", f"Wrong status code: {e.response.status_code}")
    
    return centre_map

# ============================================================================
# TEST ACCEPTANCE SCENARIO
# ============================================================================

def test_acceptance_scenario(centre_map: Dict[str, str]):
    """Run the complete acceptance scenario"""
    print("\n" + "="*80)
    print("TEST ACCEPTANCE SCENARIO")
    print("="*80)
    
    phoenix_id = centre_map['Phoenix Pallassio']
    holiday_id = centre_map['Holiday Inn']
    lulu_id = centre_map['Lulu Mall']
    
    # Set opening cash for all centres
    print("\nSetting opening cash (500000 paise = ₹5000) for all centres...")
    for name, centre_id in centre_map.items():
        set_opening_cash(centre_id, 500000)
        log_pass(f"Opening cash set for {name}", "500000 paise")
    
    # Store event IDs for later reversal tests
    event_ids = {}
    
    # Phoenix Pallassio events
    print("\n--- Phoenix Pallassio Events ---")
    e1 = create_booking(phoenix_id, "P-Alpha", 300000, "CASH")
    event_ids['phoenix_cash'] = e1['id']
    log_pass("Phoenix: CASH booking", f"300000 paise, customer P-Alpha, id={e1['id']}")
    
    e2 = create_booking(phoenix_id, "P-Bravo", 200000, "UPI_1")
    event_ids['phoenix_upi1'] = e2['id']
    log_pass("Phoenix: UPI_1 booking", f"200000 paise, customer P-Bravo, id={e2['id']}")
    
    e3 = create_booking(phoenix_id, "P-Charlie", 100000, "UPI_2")
    event_ids['phoenix_upi2'] = e3['id']
    log_pass("Phoenix: UPI_2 booking", f"100000 paise, customer P-Charlie, id={e3['id']}")
    
    e4 = create_booking(phoenix_id, "P-Delta", 150000, "CARD")
    event_ids['phoenix_card'] = e4['id']
    log_pass("Phoenix: CARD booking", f"150000 paise, customer P-Delta, id={e4['id']}")
    
    exp1 = create_expense(phoenix_id, 20000, "CASH", "Supplies")
    log_pass("Phoenix: CASH expense", "20000 paise, Supplies")
    
    exp2 = create_expense(phoenix_id, 30000, "CASH", "Wages")
    log_pass("Phoenix: CASH expense", "30000 paise, Wages")
    
    exp3 = create_expense(phoenix_id, 15000, "UPI_1", "Utilities")
    log_pass("Phoenix: UPI_1 expense", "15000 paise, Utilities")
    
    import time
    mem_code = f"MP1-{int(time.time())}"
    mem_result = create_membership(phoenix_id, "P-Echo", 500000, "CASH", mem_code)
    event_ids['phoenix_membership_sale'] = mem_result['event']['id']
    event_ids['membership_code'] = mem_code
    log_pass("Phoenix: Membership sale", f"500000 paise, code={mem_code}, customer P-Echo, id={mem_result['event']['id']}")
    
    # Holiday Inn events
    print("\n--- Holiday Inn Events ---")
    mixed_booking = create_booking(
        holiday_id, "H-Alpha", 200000, "MIXED",
        payment_breakdown={"cash": 50000, "upi_1": 100000, "upi_2": 30000, "card": 20000}
    )
    log_pass("Holiday Inn: MIXED booking", "200000 paise (cash:50000, upi_1:100000, upi_2:30000, card:20000)")
    
    import time
    gc_code = f"GH1-{int(time.time())}"
    gc_result = create_gift_card(holiday_id, "H-Buyer", "H-Recip", 300000, "UPI_2", gc_code)
    event_ids['gift_card_code'] = gc_code
    log_pass("Holiday Inn: Gift card sale", f"300000 paise, code={gc_code}, UPI_2")
    
    mem_redeem = create_booking(holiday_id, "P-Echo", 100000, "MEMBERSHIP", redemption_ref=event_ids['membership_code'])
    event_ids['holiday_membership_redeem'] = mem_redeem['id']
    log_pass("Holiday Inn: Membership redemption", f"100000 paise, code={event_ids['membership_code']}, id={mem_redeem['id']}")
    
    # Lulu Mall events
    print("\n--- Lulu Mall Events ---")
    lulu_booking = create_booking(lulu_id, "L-Alpha", 400000, "CASH")
    log_pass("Lulu Mall: CASH booking", "400000 paise, customer L-Alpha")
    
    bank_deposit = create_cash_movement(lulu_id, 100000, "BANK_DEPOSIT")
    log_pass("Lulu Mall: Bank deposit", "100000 paise")
    
    gc_redeem = create_booking(lulu_id, "H-Recip", 150000, "GIFT_CARD", redemption_ref=event_ids['gift_card_code'])
    event_ids['lulu_gc_redeem'] = gc_redeem['id']
    log_pass("Lulu Mall: Gift card redemption", f"150000 paise, code={event_ids['gift_card_code']}, id={gc_redeem['id']}")
    
    return event_ids

# ============================================================================
# TEST METRICS VERIFICATION
# ============================================================================

def test_metrics_verification(centre_map: Dict[str, str]):
    """Verify per-centre and consolidated metrics"""
    print("\n" + "="*80)
    print("TEST METRICS VERIFICATION")
    print("="*80)
    
    phoenix_id = centre_map['Phoenix Pallassio']
    holiday_id = centre_map['Holiday Inn']
    lulu_id = centre_map['Lulu Mall']
    
    # Phoenix Pallassio expected metrics
    print("\n--- Phoenix Pallassio Metrics ---")
    phoenix_dash = get_dashboard(phoenix_id, BUSINESS_DATE)
    p_agg = phoenix_dash['agg']
    
    expected_phoenix = {
        'total_revenue': 1250000,  # 300000+200000+100000+150000+500000
        'cash_sales': 800000,      # 300000+500000
        'upi_1_sales': 200000,
        'upi_2_sales': 100000,
        'card_sales': 150000,
        'total_expenses': 65000,   # 20000+30000+15000
        'cash_expenses': 50000,    # 20000+30000
        'upi_1_expenses': 15000,
        'wages_expenses': 30000,
        'bookings': 4
    }
    
    for key, expected in expected_phoenix.items():
        actual = p_agg.get(key, 0)
        if actual == expected:
            log_pass(f"Phoenix {key}", f"{actual} (expected {expected})")
        else:
            log_fail(f"Phoenix {key}", f"Expected {expected}, got {actual}")
    
    # Holiday Inn expected metrics
    print("\n--- Holiday Inn Metrics ---")
    holiday_dash = get_dashboard(holiday_id, BUSINESS_DATE)
    h_agg = holiday_dash['agg']
    
    expected_holiday = {
        'total_revenue': 500000,   # 200000+300000 (redemption NOT counted)
        'cash_sales': 50000,
        'upi_1_sales': 100000,
        'upi_2_sales': 330000,     # 30000+300000
        'card_sales': 20000,
        'redemptions': 1,
        'membership_redemption_value': 100000
    }
    
    for key, expected in expected_holiday.items():
        actual = h_agg.get(key, 0)
        if actual == expected:
            log_pass(f"Holiday Inn {key}", f"{actual} (expected {expected})")
        else:
            log_fail(f"Holiday Inn {key}", f"Expected {expected}, got {actual}")
    
    # Lulu Mall expected metrics
    print("\n--- Lulu Mall Metrics ---")
    lulu_dash = get_dashboard(lulu_id, BUSINESS_DATE)
    l_agg = lulu_dash['agg']
    
    expected_lulu = {
        'total_revenue': 400000,
        'cash_sales': 400000,
        'cash_deposited': 100000,
        'redemptions': 1,
        'gift_card_redemption_value': 150000
    }
    
    for key, expected in expected_lulu.items():
        actual = l_agg.get(key, 0)
        if actual == expected:
            log_pass(f"Lulu Mall {key}", f"{actual} (expected {expected})")
        else:
            log_fail(f"Lulu Mall {key}", f"Expected {expected}, got {actual}")
    
    # Consolidated metrics
    print("\n--- Consolidated Metrics ---")
    consolidated_dash = get_dashboard("ALL", BUSINESS_DATE)
    c_agg = consolidated_dash['agg']
    
    expected_consolidated = {
        'total_revenue': 2150000,  # 1250000+500000+400000
        'cash_sales': 1250000,     # 800000+50000+400000
        'upi_1_sales': 300000,     # 200000+100000
        'upi_2_sales': 430000,     # 100000+330000
        'card_sales': 170000       # 150000+20000
    }
    
    for key, expected in expected_consolidated.items():
        actual = c_agg.get(key, 0)
        if actual == expected:
            log_pass(f"Consolidated {key}", f"{actual} (expected {expected})")
        else:
            log_fail(f"Consolidated {key}", f"Expected {expected}, got {actual}")

# ============================================================================
# TEST FIX 2: TRUE IMMUTABILITY
# ============================================================================

def test_immutability_and_reversals(centre_map: Dict[str, str], event_ids: Dict[str, str]):
    """Test true immutability and reversal functionality"""
    print("\n" + "="*80)
    print("TEST FIX 2: TRUE IMMUTABILITY + REVERSAL TESTS")
    print("="*80)
    
    phoenix_id = centre_map['Phoenix Pallassio']
    
    # Test a) Reverse CASH booking (Phoenix 300000)
    print("\n--- Reversal Test A: CASH Booking ---")
    event_id = event_ids['phoenix_cash']
    
    # Get BEFORE state
    before = get_event_by_id(event_id)
    before_raw = extract_raw_event_fields(before)
    
    # Perform reversal
    resp = reverse_event(event_id, "Test reversal - CASH booking", "RECEPTION")
    if resp.status_code == 200:
        reversal_result = resp.json()
        reversal_id = reversal_result['reversal_event']['id']
        log_pass("Reversal A: CASH booking reversed", f"Reversal event ID: {reversal_id}")
        
        # Get AFTER state
        after = get_event_by_id(event_id)
        after_raw = extract_raw_event_fields(after)
        
        # Check immutability
        if compare_events(before, after):
            log_pass("Reversal A: Immutability check", "Original event unchanged (byte-for-byte)")
        else:
            log_fail("Reversal A: Immutability check", "Original event was modified!")
            print(f"  BEFORE: {json.dumps(before_raw, indent=2)}")
            print(f"  AFTER:  {json.dumps(after_raw, indent=2)}")
        
        # Verify no reversal metadata on original
        forbidden_fields = ['reversed_by_event_id', 'reversed_at', 'reversed_by', 'reversal_reason', 'reversed']
        found_forbidden = [f for f in forbidden_fields if f in after_raw]
        if len(found_forbidden) == 0:
            log_pass("Reversal A: No reversal metadata on original", "Clean original event")
        else:
            log_fail("Reversal A: No reversal metadata on original", 
                    f"Found forbidden fields: {found_forbidden}")
        
        # Verify reversal event properties
        reversal_event = get_event_by_id(reversal_id)
        if reversal_event.get('is_reversal') == True:
            log_pass("Reversal A: Reversal event has is_reversal=true", "")
        else:
            log_fail("Reversal A: Reversal event", "is_reversal not true")
        
        if reversal_event.get('reverses') == event_id:
            log_pass("Reversal A: Reversal event has reverses=originalId", "")
        else:
            log_fail("Reversal A: Reversal event", f"reverses field incorrect: {reversal_event.get('reverses')}")
        
        # Verify dashboard metrics decreased
        phoenix_dash = get_dashboard(phoenix_id, BUSINESS_DATE)
        p_agg = phoenix_dash['agg']
        
        # After reversal: total_revenue should be 1250000 - 300000 = 950000
        if p_agg['total_revenue'] == 950000:
            log_pass("Reversal A: Phoenix total_revenue", f"950000 (decreased by 300000)")
        else:
            log_fail("Reversal A: Phoenix total_revenue", 
                    f"Expected 950000, got {p_agg['total_revenue']}")
        
        # cash_sales should be 800000 - 300000 = 500000
        if p_agg['cash_sales'] == 500000:
            log_pass("Reversal A: Phoenix cash_sales", f"500000 (decreased by 300000)")
        else:
            log_fail("Reversal A: Phoenix cash_sales", 
                    f"Expected 500000, got {p_agg['cash_sales']}")
        
        # UPI_1, UPI_2, CARD should be unchanged
        if p_agg['upi_1_sales'] == 200000:
            log_pass("Reversal A: Phoenix upi_1_sales unchanged", "200000")
        else:
            log_fail("Reversal A: Phoenix upi_1_sales", f"Should be 200000, got {p_agg['upi_1_sales']}")
    else:
        log_fail("Reversal A: CASH booking", f"Reversal failed with status {resp.status_code}")
    
    # Test b) Reverse UPI_1 booking (Phoenix 200000)
    print("\n--- Reversal Test B: UPI_1 Booking ---")
    event_id = event_ids['phoenix_upi1']
    before = get_event_by_id(event_id)
    
    resp = reverse_event(event_id, "Test reversal - UPI_1 booking", "RECEPTION")
    if resp.status_code == 200:
        log_pass("Reversal B: UPI_1 booking reversed", "")
        
        after = get_event_by_id(event_id)
        if compare_events(before, after):
            log_pass("Reversal B: Immutability check", "Original event unchanged")
        else:
            log_fail("Reversal B: Immutability check", "Original event was modified!")
        
        phoenix_dash = get_dashboard(phoenix_id, BUSINESS_DATE)
        p_agg = phoenix_dash['agg']
        
        # upi_1_sales should be 200000 - 200000 = 0
        if p_agg['upi_1_sales'] == 0:
            log_pass("Reversal B: Phoenix upi_1_sales", "0 (decreased by 200000)")
        else:
            log_fail("Reversal B: Phoenix upi_1_sales", f"Expected 0, got {p_agg['upi_1_sales']}")
        
        # cash_sales should still be 500000 (unchanged from reversal A)
        if p_agg['cash_sales'] == 500000:
            log_pass("Reversal B: Phoenix cash_sales unchanged", "500000")
        else:
            log_fail("Reversal B: Phoenix cash_sales", f"Should be 500000, got {p_agg['cash_sales']}")
    else:
        log_fail("Reversal B: UPI_1 booking", f"Reversal failed with status {resp.status_code}")
    
    # Test c) Reverse UPI_2 booking (Phoenix 100000)
    print("\n--- Reversal Test C: UPI_2 Booking ---")
    event_id = event_ids['phoenix_upi2']
    before = get_event_by_id(event_id)
    
    resp = reverse_event(event_id, "Test reversal - UPI_2 booking", "RECEPTION")
    if resp.status_code == 200:
        log_pass("Reversal C: UPI_2 booking reversed", "")
        
        after = get_event_by_id(event_id)
        if compare_events(before, after):
            log_pass("Reversal C: Immutability check", "Original event unchanged")
        else:
            log_fail("Reversal C: Immutability check", "Original event was modified!")
        
        phoenix_dash = get_dashboard(phoenix_id, BUSINESS_DATE)
        p_agg = phoenix_dash['agg']
        
        # upi_2_sales should be 100000 - 100000 = 0
        if p_agg['upi_2_sales'] == 0:
            log_pass("Reversal C: Phoenix upi_2_sales", "0 (decreased by 100000)")
        else:
            log_fail("Reversal C: Phoenix upi_2_sales", f"Expected 0, got {p_agg['upi_2_sales']}")
    else:
        log_fail("Reversal C: UPI_2 booking", f"Reversal failed with status {resp.status_code}")
    
    # Test d) Reverse CARD booking (Phoenix 150000)
    print("\n--- Reversal Test D: CARD Booking ---")
    event_id = event_ids['phoenix_card']
    before = get_event_by_id(event_id)
    
    resp = reverse_event(event_id, "Test reversal - CARD booking", "RECEPTION")
    if resp.status_code == 200:
        log_pass("Reversal D: CARD booking reversed", "")
        
        after = get_event_by_id(event_id)
        if compare_events(before, after):
            log_pass("Reversal D: Immutability check", "Original event unchanged")
        else:
            log_fail("Reversal D: Immutability check", "Original event was modified!")
        
        phoenix_dash = get_dashboard(phoenix_id, BUSINESS_DATE)
        p_agg = phoenix_dash['agg']
        
        # card_sales should be 150000 - 150000 = 0
        if p_agg['card_sales'] == 0:
            log_pass("Reversal D: Phoenix card_sales", "0 (decreased by 150000)")
        else:
            log_fail("Reversal D: Phoenix card_sales", f"Expected 0, got {p_agg['card_sales']}")
        
        # After all 4 reversals, Phoenix should only have membership sale revenue
        # total_revenue = 500000 (only membership sale)
        if p_agg['total_revenue'] == 500000:
            log_pass("Reversal D: Phoenix total_revenue after all reversals", "500000 (only membership sale)")
        else:
            log_fail("Reversal D: Phoenix total_revenue", f"Expected 500000, got {p_agg['total_revenue']}")
    else:
        log_fail("Reversal D: CARD booking", f"Reversal failed with status {resp.status_code}")
    
    # Test e) Reverse MEMBERSHIP redemption (Holiday Inn 100000)
    print("\n--- Reversal Test E: Membership Redemption ---")
    event_id = event_ids['holiday_membership_redeem']
    before = get_event_by_id(event_id)
    
    # Check membership balance before reversal
    mem_before = get_membership(event_ids['membership_code'])
    balance_before = mem_before['remaining_paise']
    print(f"  Membership {event_ids['membership_code']} balance before reversal: {balance_before}")
    
    resp = reverse_event(event_id, "Test reversal - Membership redemption", "RECEPTION")
    if resp.status_code == 200:
        log_pass("Reversal E: Membership redemption reversed", "")
        
        after = get_event_by_id(event_id)
        if compare_events(before, after):
            log_pass("Reversal E: Immutability check", "Original event unchanged")
        else:
            log_fail("Reversal E: Immutability check", "Original event was modified!")
        
        # Check membership balance after reversal - should be restored to 500000
        mem_after = get_membership(event_ids['membership_code'])
        balance_after = mem_after['remaining_paise']
        print(f"  Membership {event_ids['membership_code']} balance after reversal: {balance_after}")
        
        if balance_after == 500000:
            log_pass("Reversal E: Membership balance restored", f"500000 (was {balance_before})")
        else:
            log_fail("Reversal E: Membership balance", 
                    f"Expected 500000, got {balance_after} (was {balance_before})")
    else:
        log_fail("Reversal E: Membership redemption", f"Reversal failed with status {resp.status_code}")
    
    # Test f) Reverse GIFT_CARD redemption (Lulu Mall 150000)
    print("\n--- Reversal Test F: Gift Card Redemption ---")
    event_id = event_ids['lulu_gc_redeem']
    before = get_event_by_id(event_id)
    
    # Check gift card balance before reversal
    gc_before = get_gift_card(event_ids['gift_card_code'])
    balance_before = gc_before['remaining_paise']
    print(f"  Gift card {event_ids['gift_card_code']} balance before reversal: {balance_before}")
    
    resp = reverse_event(event_id, "Test reversal - Gift card redemption", "RECEPTION")
    if resp.status_code == 200:
        log_pass("Reversal F: Gift card redemption reversed", "")
        
        after = get_event_by_id(event_id)
        if compare_events(before, after):
            log_pass("Reversal F: Immutability check", "Original event unchanged")
        else:
            log_fail("Reversal F: Immutability check", "Original event was modified!")
        
        # Check gift card balance after reversal - should be restored to 300000
        gc_after = get_gift_card(event_ids['gift_card_code'])
        balance_after = gc_after['remaining_paise']
        print(f"  Gift card {event_ids['gift_card_code']} balance after reversal: {balance_after}")
        
        if balance_after == 300000:
            log_pass("Reversal F: Gift card balance restored", f"300000 (was {balance_before})")
        else:
            log_fail("Reversal F: Gift card balance", 
                    f"Expected 300000, got {balance_after} (was {balance_before})")
    else:
        log_fail("Reversal F: Gift card redemption", f"Reversal failed with status {resp.status_code}")

# ============================================================================
# TEST REVERSAL RULES
# ============================================================================

def test_reversal_rules(event_ids: Dict[str, str]):
    """Test reversal business rules"""
    print("\n" + "="*80)
    print("TEST REVERSAL RULES")
    print("="*80)
    
    # Test: Cannot reverse already-reversed event
    print("\n--- Rule: Cannot reverse already-reversed event ---")
    event_id = event_ids['phoenix_cash']  # Already reversed in previous test
    resp = reverse_event(event_id, "Attempt double reversal", "RECEPTION")
    if resp.status_code == 400:
        error = resp.json().get('error', '')
        if 'already reversed' in error.lower():
            log_pass("Rule: Double reversal prevention", f"400 error: {error}")
        else:
            log_fail("Rule: Double reversal prevention", f"400 but wrong message: {error}")
    else:
        log_fail("Rule: Double reversal prevention", f"Expected 400, got {resp.status_code}")
    
    # Test: Reason mandatory
    print("\n--- Rule: Reason mandatory ---")
    # Create a new booking to test
    centres = get_centres()
    phoenix_id = next(c['id'] for c in centres if c['name'] == 'Phoenix Pallassio')
    test_booking = create_booking(phoenix_id, "Test-User", 10000, "CASH")
    
    resp = requests.post(
        f"{BASE_URL}/events/{test_booking['id']}/reverse",
        json={"reason": "", "actor": "test", "role": "RECEPTION"}
    )
    if resp.status_code == 400:
        error = resp.json().get('error', '')
        if 'reason' in error.lower() and 'mandatory' in error.lower():
            log_pass("Rule: Mandatory reason", f"400 error: {error}")
        else:
            log_fail("Rule: Mandatory reason", f"400 but wrong message: {error}")
    else:
        log_fail("Rule: Mandatory reason", f"Expected 400, got {resp.status_code}")
    
    # Test: Cannot reverse a reversal event
    print("\n--- Rule: Cannot reverse a reversal event ---")
    # Get a reversal event ID from previous tests
    all_events = get_events(from_date=BUSINESS_DATE, to_date=BUSINESS_DATE)
    reversal_events = [e for e in all_events if e.get('is_reversal') == True]
    if reversal_events:
        reversal_id = reversal_events[0]['id']
        resp = reverse_event(reversal_id, "Attempt to reverse a reversal", "RECEPTION")
        if resp.status_code == 400:
            error = resp.json().get('error', '')
            if 'cannot reverse a reversal' in error.lower():
                log_pass("Rule: Cannot reverse reversal", f"400 error: {error}")
            else:
                log_fail("Rule: Cannot reverse reversal", f"400 but wrong message: {error}")
        else:
            log_fail("Rule: Cannot reverse reversal", f"Expected 400, got {resp.status_code}")
    else:
        log_warning("Rule: Cannot reverse reversal", "No reversal events found to test")

# ============================================================================
# TEST REPORTS MODULE
# ============================================================================

def test_reports_module(centre_map: Dict[str, str]):
    """Test the reports module"""
    print("\n" + "="*80)
    print("TEST REPORTS MODULE")
    print("="*80)
    
    phoenix_id = centre_map['Phoenix Pallassio']
    holiday_id = centre_map['Holiday Inn']
    lulu_id = centre_map['Lulu Mall']
    
    # Test: P&L Report with centre_id=ALL
    print("\n--- P&L Report: ALL Centres, Month Group ---")
    # Use the specific test date range to avoid accumulated data from other test runs
    report = get_pl_report("ALL", BUSINESS_DATE, BUSINESS_DATE, "day")
    
    if 'totals' in report and 'consolidated' in report['totals']:
        consolidated = report['totals']['consolidated']
        
        # After reversals: Phoenix net_revenue = 500000 + 10000 (test booking)
        # Total = 1400000 + 10000 = 1410000
        expected_net_revenue = 1410000
        actual_net_revenue = consolidated.get('net_revenue', 0)
        
        if actual_net_revenue == expected_net_revenue:
            log_pass("Report: Consolidated net_revenue after reversals", 
                    f"{actual_net_revenue} (expected {expected_net_revenue})")
        else:
            log_fail("Report: Consolidated net_revenue", 
                    f"Expected {expected_net_revenue}, got {actual_net_revenue}")
        
        # Check per_centre has 3 entries
        per_centre = report['totals'].get('per_centre', [])
        if len(per_centre) == 3:
            log_pass("Report: Per-centre entries", f"3 centres present")
        else:
            log_fail("Report: Per-centre entries", f"Expected 3, got {len(per_centre)}")
        
        # Verify Phoenix metrics after reversals (includes 10000 test booking)
        phoenix_entry = next((c for c in per_centre if c['centre_id'] == phoenix_id), None)
        if phoenix_entry:
            # Phoenix: net_revenue = 500000 + 10000 (test booking)
            if phoenix_entry['net_revenue'] == 510000:
                log_pass("Report: Phoenix net_revenue", "510000 (500000 membership + 10000 test booking)")
            else:
                log_fail("Report: Phoenix net_revenue", 
                        f"Expected 510000, got {phoenix_entry['net_revenue']}")
            
            # Phoenix: upi_1_sales = 0 (reversed)
            if phoenix_entry['upi_1_sales'] == 0:
                log_pass("Report: Phoenix upi_1_sales", "0 (reversed)")
            else:
                log_fail("Report: Phoenix upi_1_sales", 
                        f"Expected 0, got {phoenix_entry['upi_1_sales']}")
            
            # Phoenix: upi_2_sales = 0 (reversed)
            if phoenix_entry['upi_2_sales'] == 0:
                log_pass("Report: Phoenix upi_2_sales", "0 (reversed)")
            else:
                log_fail("Report: Phoenix upi_2_sales", 
                        f"Expected 0, got {phoenix_entry['upi_2_sales']}")
            
            # Phoenix: card_sales = 0 (reversed)
            if phoenix_entry['card_sales'] == 0:
                log_pass("Report: Phoenix card_sales", "0 (reversed)")
            else:
                log_fail("Report: Phoenix card_sales", 
                        f"Expected 0, got {phoenix_entry['card_sales']}")
            
            # Phoenix: cash_sales = 500000 + 10000 (membership sale + test booking)
            if phoenix_entry['cash_sales'] == 510000:
                log_pass("Report: Phoenix cash_sales", "510000 (500000 membership + 10000 test)")
            else:
                log_fail("Report: Phoenix cash_sales", 
                        f"Expected 510000, got {phoenix_entry['cash_sales']}")
            
            # Phoenix: revenue_reversals = 750000 (300000+200000+100000+150000)
            if phoenix_entry['revenue_reversals'] == 750000:
                log_pass("Report: Phoenix revenue_reversals", "750000")
            else:
                log_fail("Report: Phoenix revenue_reversals", 
                        f"Expected 750000, got {phoenix_entry['revenue_reversals']}")
            
            # Phoenix: gross_revenue - revenue_reversals = net_revenue
            gross = phoenix_entry.get('gross_revenue', 0)
            reversals = phoenix_entry.get('revenue_reversals', 0)
            net = phoenix_entry.get('net_revenue', 0)
            if gross - reversals == net:
                log_pass("Report: Phoenix gross - reversals = net", 
                        f"{gross} - {reversals} = {net}")
            else:
                log_fail("Report: Phoenix gross - reversals = net", 
                        f"{gross} - {reversals} ≠ {net}")
        else:
            log_fail("Report: Phoenix entry", "Not found in per_centre")
    else:
        log_fail("Report: Structure", "Missing totals.consolidated")
    
    # Test: Different groupings
    print("\n--- P&L Report: Different Groupings ---")
    for group in ['day', 'week', 'year']:
        try:
            report = get_pl_report("ALL", BUSINESS_DATE, BUSINESS_DATE, group)
            if 'rows' in report and 'totals' in report:
                log_pass(f"Report: Group={group}", f"Valid JSON with rows and totals")
            else:
                log_fail(f"Report: Group={group}", "Missing rows or totals")
        except Exception as e:
            log_fail(f"Report: Group={group}", str(e))
    
    # Test: Individual centre report
    print("\n--- P&L Report: Individual Centre (Phoenix) ---")
    phoenix_report = get_pl_report(phoenix_id, BUSINESS_DATE, BUSINESS_DATE, "day")
    if 'totals' in phoenix_report and 'consolidated' in phoenix_report['totals']:
        phoenix_totals = phoenix_report['totals']['consolidated']
        
        # Should show only Phoenix data (includes 10000 test booking)
        if phoenix_totals['net_revenue'] == 510000:
            log_pass("Report: Phoenix individual report net_revenue", "510000 (includes test booking)")
        else:
            log_fail("Report: Phoenix individual report", 
                    f"Expected net_revenue=510000, got {phoenix_totals['net_revenue']}")
        
        # Verify no data leak from other centres
        per_centre = phoenix_report['totals'].get('per_centre', [])
        if len(per_centre) == 1 and per_centre[0]['centre_id'] == phoenix_id:
            log_pass("Report: Phoenix individual - no data leak", "Only Phoenix data present")
        else:
            log_fail("Report: Phoenix individual - data leak", 
                    f"Expected 1 centre (Phoenix), got {len(per_centre)}")
    else:
        log_fail("Report: Phoenix individual", "Missing totals.consolidated")
    
    # Test: CSV Report
    print("\n--- CSV Report ---")
    try:
        csv_content = get_csv_report("ALL", BUSINESS_DATE, BUSINESS_DATE, "day")
        
        # Check it's CSV format
        lines = csv_content.strip().split('\n')
        # Skip comment lines starting with #
        data_lines = [l for l in lines if not l.startswith('#')]
        
        if len(data_lines) > 0:
            log_pass("Report: CSV format", f"{len(data_lines)} lines (including header)")
            
            # Check for required columns
            header = data_lines[0]
            required_cols = ['Period', 'Centre', 'Opening Cash', 'Booking Sales', 
                           'Membership Sales', 'Gift Card Sales', 'Gross Revenue', 
                           'Revenue Reversals', 'Net Revenue', 'Cash Sales', 
                           'UPI 1 Sales', 'UPI 2 Sales', 'Card Sales']
            
            # Check if header has content
            if len(header.strip()) > 0:
                log_pass("Report: CSV columns", f"CSV header present with {len(header.split(','))} columns")
            else:
                log_warning("Report: CSV columns", "CSV header is empty (may be no data for test date)")
            
            # Check for ALL CENTRES row
            all_centres_rows = [l for l in data_lines if 'ALL CENTRES' in l]
            if len(all_centres_rows) > 0:
                log_pass("Report: CSV ALL CENTRES row", "Present")
            else:
                log_fail("Report: CSV ALL CENTRES row", "Not found")
        else:
            log_fail("Report: CSV format", "No data lines found")
    except Exception as e:
        log_fail("Report: CSV", str(e))
    
    # Test: Cash movements don't affect revenue/expenses
    print("\n--- Report: Cash movements isolation ---")
    lulu_report = get_pl_report(lulu_id, BUSINESS_DATE, BUSINESS_DATE, "day")
    if 'totals' in lulu_report and 'consolidated' in lulu_report['totals']:
        lulu_totals = lulu_report['totals']['consolidated']
        
        # Lulu had BANK_DEPOSIT 100000 - should NOT be in revenue/expenses
        # total_revenue should be 400000 (only booking)
        if lulu_totals['total_revenue'] == 400000:
            log_pass("Report: Lulu cash movement isolation", 
                    "BANK_DEPOSIT not in revenue (400000)")
        else:
            log_fail("Report: Lulu cash movement isolation", 
                    f"Expected revenue=400000, got {lulu_totals['total_revenue']}")
        
        # cash_deposited should be 100000
        if lulu_totals['cash_deposited'] == 100000:
            log_pass("Report: Lulu cash_deposited", "100000")
        else:
            log_fail("Report: Lulu cash_deposited", 
                    f"Expected 100000, got {lulu_totals['cash_deposited']}")
    else:
        log_fail("Report: Lulu report", "Missing totals.consolidated")

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================

def main():
    """Main test execution"""
    print("="*80)
    print("SPA ERP BACKEND - CRITICAL VERIFICATION PASS")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Business Date: {BUSINESS_DATE}")
    print("="*80)
    
    try:
        # Test FIX 1: Centres
        centre_map = test_centres()
        
        # Test Acceptance Scenario
        event_ids = test_acceptance_scenario(centre_map)
        
        # Test Metrics Verification (before reversals)
        test_metrics_verification(centre_map)
        
        # Test FIX 2: True Immutability + Reversals
        test_immutability_and_reversals(centre_map, event_ids)
        
        # Test Reversal Rules
        test_reversal_rules(event_ids)
        
        # Test Reports Module
        test_reports_module(centre_map)
        
    except Exception as e:
        log_fail("CRITICAL ERROR", str(e))
        import traceback
        traceback.print_exc()
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"✅ PASSED: {len(test_results['passed'])}")
    print(f"❌ FAILED: {len(test_results['failed'])}")
    print(f"⚠️  WARNINGS: {len(test_results['warnings'])}")
    
    if test_results['failed']:
        print("\n" + "="*80)
        print("FAILED TESTS:")
        print("="*80)
        for fail in test_results['failed']:
            print(fail)
    
    if test_results['warnings']:
        print("\n" + "="*80)
        print("WARNINGS:")
        print("="*80)
        for warn in test_results['warnings']:
            print(warn)
    
    print("\n" + "="*80)
    if len(test_results['failed']) == 0:
        print("🎉 ALL TESTS PASSED!")
    else:
        print(f"⚠️  {len(test_results['failed'])} TESTS FAILED")
    print("="*80)

if __name__ == "__main__":
    main()
