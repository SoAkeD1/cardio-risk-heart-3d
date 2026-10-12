from fastapi import APIRouter, Depends

from ..schemas import SchemaResponse
from ..services import Services
from .deps import svc

router = APIRouter(tags=["meta"])


@router.get("/schema", response_model=SchemaResponse)
def schema(s: Services = Depends(svc)):
    return s.feature_schema()
