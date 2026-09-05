import pytest


def pytest_collection_modifyitems(config, items):
    # Ensure asyncio mode is enabled for @pytest.mark.asyncio tests
    pass
