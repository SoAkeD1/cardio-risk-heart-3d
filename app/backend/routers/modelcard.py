from fastapi import APIRouter, Depends

from ..schemas import ModelCard
from ..services import Services
from .deps import svc

router = APIRouter(tags=["meta"])


@router.get("/model-card", response_model=ModelCard)
def model_card(s: Services = Depends(svc)):
    return s.model_card()
