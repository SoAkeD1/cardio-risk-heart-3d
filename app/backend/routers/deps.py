"""Shared dependency: the Services instance created once in the app lifespan."""
from __future__ import annotations

from fastapi import Request

from ..services import Services


def svc(request: Request) -> Services:
    return request.app.state.services
