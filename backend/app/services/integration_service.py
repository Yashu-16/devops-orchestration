# integration_service.py
# Handles CI/CD platform integrations.
# Normalizes webhook payloads from different platforms
# into a single standard format our pipeline can process.

import hmac
import hashlib
import secrets
import logging
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.models.pipeline import Integration, Pipeline, Organization
from app.schemas.pipeline import WebhookPayload

logger = logging.getLogger(__name__)

# Platform display info
PLATFORM_INFO = {
    "github": {
        "name":        "GitHub",
        "color":       "#24292e",
        "icon":        "github",
        "webhook_doc": "Settings → Webhooks → Add webhook",
        "events":      ["push"],
    },
    "gitlab": {
        "name":        "GitLab",
        "color":       "#fc6d26",
        "icon":        "gitlab",
        "webhook_doc": "Settings → Webhooks",
        "events":      ["Push events"],
    },
    "bitbucket": {
        "name":        "Bitbucket",
        "color":       "#0052cc",
        "icon":        "bitbucket",
        "webhook_doc": "Repository Settings → Webhooks",
        "events":      ["Repository Push"],
    },
    "azure": {
        "name":        "Azure DevOps",
        "color":       "#0078d4",
        "icon":        "azure",
        "webhook_doc": "Project Settings → Service Hooks",
        "events":      ["Code pushed"],
    },
}


class IntegrationService:

    def __init__(self, db: Session):
        self.db = db

    # ── CRUD ─────────────────────────────────────────────────────

    def create_integration(
        self,
        org_id: int,
        platform: str,
        name: str,
        access_token: Optional[str] = None,
    ) -> Integration:
        """Create a new platform integration for an organization."""
        if platform not in PLATFORM_INFO:
            raise ValueError(
                f"Unsupported platform: {platform}. "
                f"Supported: {', '.join(PLATFORM_INFO.keys())}"
            )

        # Generate a webhook secret for this integration
        # This is used to verify that webhooks come from the real platform
        webhook_secret = secrets.token_hex(32)

        integration = Integration(
            organization_id=org_id,
            platform=platform,
            name=name,
            webhook_secret=webhook_secret,
            access_token=access_token,
            is_active=True,
        )
        self.db.add(integration)
        self.db.commit()
        self.db.refresh(integration)

        logger.info(
            f"Integration created: {platform} for org={org_id} "
            f"name={name}"
        )
        return integration

    def get_integrations(self, org_id: int) -> list:
        """Get all integrations for an organization."""
        return (
            self.db.query(Integration)
            .filter(
                Integration.organization_id == org_id,
                Integration.is_active == True,
            )
            .order_by(Integration.created_at.desc())
            .all()
        )

    def delete_integration(self, org_id: int, integration_id: int) -> None:
        """Remove an integration."""
        integration = self.db.query(Integration).filter(
            Integration.id == integration_id,
            Integration.organization_id == org_id,
        ).first()
        if not integration:
            raise ValueError("Integration not found")
        integration.is_active = False
        self.db.commit()
        logger.info(
            f"Integration deleted: {integration.platform} "
            f"org={org_id}"
        )

    def get_webhook_url(
        self, integration: Integration, base_url: str = "http://localhost:8000"
    ) -> str:
        """Generate the webhook URL for a specific integration."""
        return (
            f"{base_url}/api/v1/webhooks/"
            f"{integration.platform}/{integration.id}"
        )

    # ── Webhook parsing ───────────────────────────────────────────

    def parse_github_webhook(self, payload: dict) -> Optional[WebhookPayload]:
        """
        Parse a GitHub push webhook payload.
        GitHub sends this when code is pushed to a repository.
        """
        ref = payload.get("ref", "")
        if not ref.startswith("refs/heads/"):
            return None  # Not a branch push (might be a tag)

        branch     = ref.replace("refs/heads/", "")
        repo       = payload.get("repository", {})
        repo_url   = repo.get("clone_url", "") or repo.get("html_url", "")
        head       = payload.get("head_commit", {})
        commit     = head.get("id", "")[:8] if head else ""
        pusher     = payload.get("pusher", {}).get("name", "unknown")
        commit_msg = head.get("message", "") if head else ""

        if not repo_url or not branch:
            return None

        return WebhookPayload(
            platform="github",
            repo_url=repo_url,
            branch=branch,
            commit_hash=commit,
            pusher=pusher,
            commit_msg=commit_msg[:100],
        )

    def parse_gitlab_webhook(self, payload: dict) -> Optional[WebhookPayload]:
        """
        Parse a GitLab push webhook payload.
        GitLab sends X-Gitlab-Event: Push Hook header.
        """
        ref = payload.get("ref", "")
        if not ref.startswith("refs/heads/"):
            return None

        branch   = ref.replace("refs/heads/", "")
        project  = payload.get("project", {})
        repo_url = (
            project.get("http_url", "") or
            project.get("git_http_url", "")
        )
        commits    = payload.get("commits", [])
        commit     = payload.get("checkout_sha", "")[:8] if payload.get("checkout_sha") else ""
        pusher     = payload.get("user_name", "unknown")
        commit_msg = commits[0].get("message", "") if commits else ""

        if not repo_url or not branch:
            return None

        return WebhookPayload(
            platform="gitlab",
            repo_url=repo_url,
            branch=branch,
            commit_hash=commit,
            pusher=pusher,
            commit_msg=commit_msg[:100],
        )

    def parse_bitbucket_webhook(self, payload: dict) -> Optional[WebhookPayload]:
        """
        Parse a Bitbucket push webhook payload.
        Bitbucket sends X-Event-Key: repo:push header.
        """
        push = payload.get("push", {})
        changes = push.get("changes", [])
        if not changes:
            return None

        change = changes[0]
        new    = change.get("new", {})
        if not new or new.get("type") != "branch":
            return None

        branch   = new.get("name", "")
        repo     = payload.get("repository", {})
        links    = repo.get("links", {})
        html     = links.get("html", {})
        repo_url = html.get("href", "")

        # Get commit info
        target     = new.get("target", {})
        commit     = target.get("hash", "")[:8]
        author     = target.get("author", {})
        pusher     = author.get("user", {}).get("display_name", "unknown") if isinstance(author, dict) else "unknown"
        commit_msg = target.get("message", "")[:100]

        if not repo_url or not branch:
            return None

        return WebhookPayload(
            platform="bitbucket",
            repo_url=repo_url,
            branch=branch,
            commit_hash=commit,
            pusher=pusher,
            commit_msg=commit_msg,
        )

    def parse_azure_webhook(self, payload: dict) -> Optional[WebhookPayload]:
        """
        Parse an Azure DevOps push webhook payload.
        Azure sends eventType: git.push
        """
        event_type = payload.get("eventType", "")
        if event_type != "git.push":
            return None

        resource   = payload.get("resource", {})
        repo       = resource.get("repository", {})
        remote_url = repo.get("remoteUrl", "")
        ref_updates = resource.get("refUpdates", [])

        if not ref_updates:
            return None

        ref    = ref_updates[0].get("name", "")
        branch = ref.replace("refs/heads/", "")
        commit = ref_updates[0].get("newObjectId", "")[:8]

        pushed_by = resource.get("pushedBy", {})
        pusher    = pushed_by.get("displayName", "unknown")

        commits    = resource.get("commits", [])
        commit_msg = commits[0].get("comment", "") if commits else ""

        if not remote_url or not branch:
            return None

        return WebhookPayload(
            platform="azure",
            repo_url=remote_url,
            branch=branch,
            commit_hash=commit,
            pusher=pusher,
            commit_msg=commit_msg[:100],
        )

    def verify_github_signature(
        self, payload_bytes: bytes, signature: str, secret: str
    ) -> bool:
        """
        Verify the X-Hub-Signature-256 header from GitHub.
        This proves the webhook came from GitHub, not a random attacker.
        """
        if not signature or not secret:
            return True  # Skip verification if no secret set
        expected = "sha256=" + hmac.new(
            secret.encode(), payload_bytes, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    def find_matching_pipeline(
        self, payload: WebhookPayload, org_id: Optional[int] = None
    ) -> Optional[Pipeline]:
        """
        Find a pipeline that matches the webhook's repository and branch.
        Searches across all organizations if org_id is not specified.
        """
        query = self.db.query(Pipeline)
        if org_id:
            query = query.filter(Pipeline.organization_id == org_id)

        pipelines = query.all()

        for pipeline in pipelines:
            if not pipeline.repository:
                continue

            # Normalize URLs for comparison
            # github.com/user/repo matches https://github.com/user/repo.git
            repo_normalized    = self._normalize_url(pipeline.repository)
            payload_normalized = self._normalize_url(payload.repo_url)

            if repo_normalized in payload_normalized or payload_normalized in repo_normalized:
                # Check branch match (* means any branch)
                if pipeline.branch == payload.branch or pipeline.branch == "*":
                    return pipeline

        return None

    def _normalize_url(self, url: str) -> str:
        """Normalize a repository URL for comparison."""
        url = url.lower()
        url = url.replace("https://", "").replace("http://", "")
        url = url.replace("git@github.com:", "github.com/")
        url = url.replace("git@gitlab.com:", "gitlab.com/")
        url = url.rstrip("/").rstrip(".git")
        return url

    def record_trigger(self, integration: Integration) -> None:
        """Record that this integration was triggered."""
        integration.last_triggered = datetime.now(timezone.utc)
        integration.trigger_count  += 1
        self.db.commit()