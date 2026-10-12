from fastapi import APIRouter, Depends

from ..schemas import Health
from ..services import Services
from ..settings import get_settings
from .deps import svc

router = APIRouter(tags=["meta"])


@router.get("/health", response_model=Health)
def health(s: Services = Depends(svc)):
    return s.health(get_settings().VERSION)
