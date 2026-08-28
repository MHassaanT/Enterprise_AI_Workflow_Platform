"""
Test Suite — Agent 3: HR Recruitment Agent

Tests the LLM-powered HR recruitment router: candidate ranking, email sending,
talent pool scanning, application ranking, and project pacing.
"""
import sys, os, pytest, json
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestHRModels:
    def test_rank_request(self):
        from routers.hr import RankRequest
        r = RankRequest(tenant_id="t", job_description_id="j1", job_title="Eng",
                        job_description="Build stuff", job_requirements="Python",
                        resume_ids=["r1", "r2"])
        assert len(r.resume_ids) == 2

    def test_schedule_email_request(self):
        from routers.hr import ScheduleEmailRequest
        r = ScheduleEmailRequest(tenant_id="t", candidate_ids=["c1"], interview_details="Zoom call")
        assert r.interview_details == "Zoom call"

    def test_scan_talent_pool_request(self):
        from routers.hr import ScanTalentPoolRequest
        r = ScanTalentPoolRequest(tenant_id="t", open_role_id="o1", role_title="Dev",
                                  role_description="Backend", role_requirements="Node.js")
        assert r.role_title == "Dev"

    def test_rank_applications_request(self):
        from routers.hr import RankApplicationsRequest
        r = RankApplicationsRequest(tenant_id="t", open_role_id="o1", role_title="Dev",
                                    role_description="Backend", role_requirements="Node.js",
                                    application_ids=["a1", "a2", "a3"])
        assert len(r.application_ids) == 3

    def test_project_pacing_request(self):
        from routers.hr import ProjectPacingRequest
        r = ProjectPacingRequest(tenant_id="t")
        assert r.tenant_id == "t"


class TestHRRankCandidates:
    @pytest.mark.asyncio
    async def test_rank_with_no_matching_resumes(self):
        """When resume_ids don't match any chunks, no scoring occurs."""
        from routers.hr import rank_candidates, RankRequest
        from fastapi import HTTPException

        mock_llm = MagicMock()
        request = RankRequest(tenant_id="t", job_description_id="j1", job_title="Eng",
                              job_description="Build", job_requirements="Python",
                              resume_ids=["nonexistent"])

        with patch("routers.hr.get_all_hr_resumes", AsyncMock(return_value=[])), \
             patch("routers.hr.get_llm", return_value=mock_llm):
            result = await rank_candidates(
                request=request,
                x_internal_token="internal_secret_change_in_production"
            )
        assert result["status"] == "success"
        assert result["scored"] == 0

    @pytest.mark.asyncio
    async def test_rank_unauthorized_raises_401(self):
        from routers.hr import rank_candidates, RankRequest
        from fastapi import HTTPException
        request = RankRequest(tenant_id="t", job_description_id="j1", job_title="E",
                              job_description="D", job_requirements="R", resume_ids=[])
        with pytest.raises(HTTPException) as e:
            await rank_candidates(request=request, x_internal_token="wrong")
        assert e.value.status_code == 401

    @pytest.mark.asyncio
    async def test_rank_with_matching_resumes(self):
        """Scoring works when chunks match resume_ids."""
        from routers.hr import rank_candidates, RankRequest
        from tests.conftest import MockAIMessage

        mock_llm = MagicMock()
        mock_llm.ainvoke = AsyncMock(return_value=MockAIMessage(
            content=json.dumps({
                "candidate_name": "John Doe",
                "candidate_email": "john@test.com",
                "score": 85,
                "reasoning": "Strong Python skills",
                "skills_matched": ["Python", "FastAPI"]
            })
        ))

        chunks = [
            {"resumeId": "r1", "candidateName": "John", "chunkIndex": 0,
             "text": "John Doe — Senior Python Developer with 5 years experience"}
        ]

        request = RankRequest(tenant_id="t", job_description_id="j1", job_title="Backend Eng",
                              job_description="Build APIs", job_requirements="Python, FastAPI",
                              resume_ids=["r1"])

        with patch("routers.hr.get_all_hr_resumes", AsyncMock(return_value=chunks)), \
             patch("routers.hr.get_llm", return_value=mock_llm), \
             patch("asyncpg.connect", AsyncMock(return_value=AsyncMock(
                 execute=AsyncMock(), close=AsyncMock()))):
            result = await rank_candidates(
                request=request,
                x_internal_token="internal_secret_change_in_production"
            )
        assert result["scored"] == 1


class TestHRScanTalentPool:
    @pytest.mark.asyncio
    async def test_empty_talent_pool(self):
        from routers.hr import scan_talent_pool, ScanTalentPoolRequest

        request = ScanTalentPoolRequest(tenant_id="t", open_role_id="o1", role_title="Dev",
                                        role_description="Backend", role_requirements="Node.js")

        mock_client = AsyncMock()
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"prospects": []}
        mock_resp.raise_for_status = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await scan_talent_pool(
                request=request,
                x_internal_token="internal_secret_change_in_production"
            )
        assert result["status"] == "success"
        assert result["transferred"] == 0


class TestHRCheckProjectPacing:
    @pytest.mark.asyncio
    async def test_check_project_pacing_delegates(self):
        from routers.hr import check_project_pacing_endpoint, ProjectPacingRequest

        request = ProjectPacingRequest(tenant_id="t")

        # check_project_pacing is imported inside the function from hr_polling
        with patch("hr_polling.check_project_pacing", AsyncMock()) as mock_fn:
            result = await check_project_pacing_endpoint(
                request=request,
                x_internal_token="internal_secret_change_in_production"
            )
        assert result["status"] == "success"
        mock_fn.assert_called_once_with("t")
