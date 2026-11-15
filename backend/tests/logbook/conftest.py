import pytest

from tests.conftest import client_with


@pytest.fixture()
def client():
    yield from client_with(placements=True)
