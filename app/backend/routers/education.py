from fastapi import APIRouter, Depends

from ..schemas import Education
from ..services import Services
from .deps import svc

router = APIRouter(tags=["meta"])


@router.get("/education", response_model=Education)
def education(s: Services = Depends(svc)):
    """Optional general-population education content (app/backend/content/education.json). Never patient-specific."""
    return s.education
