from app.services.order_status import assert_valid_transition


def test_valid_transition_chain():
    assert_valid_transition("RECEIVED", "IN_PROGRESS")
    assert_valid_transition("IN_PROGRESS", "DONE")
    assert_valid_transition("DONE", "DELIVERED")


def test_invalid_transition_raises():
    try:
        assert_valid_transition("RECEIVED", "DONE")
        raised = False
    except ValueError:
        raised = True
    assert raised
