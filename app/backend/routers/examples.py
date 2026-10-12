from fastapi import APIRouter, Depends

from ..schemas import ExamplesResponse
from ..services import Services
from .deps import svc

router = APIRouter(tags=["meta"])


@router.get("/examples", response_model=ExamplesResponse)
def examples(s: Services = Depends(svc)):
    return dict(examples=s.examples(),
                note="De-identified hold-out patients chosen deterministically from split.json. true_labels are "
                     "for model-card transparency only and are hidden in the main UI.")
