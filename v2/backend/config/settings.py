from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, True),
    SECRET_KEY=(str, "change-me"),
    ALLOWED_HOSTS=(list, ["127.0.0.1", "localhost"]),
    CORS_ALLOWED_ORIGINS=(list, ["http://127.0.0.1:5180", "http://localhost:5180"]),
    CSRF_TRUSTED_ORIGINS=(list, ["http://127.0.0.1:5180", "http://localhost:5180"]),
    FRONTEND_URL=(str, "http://localhost:5180"),
    OIDC_ISSUER_URL=(str, "https://auth.pascuans.dev"),
    OIDC_CLIENT_ID=(str, ""),
    OIDC_CLIENT_SECRET=(str, ""),
    SQLITE_PATH=(str, ""),
)
environ.Env.read_env(BASE_DIR / ".env")

DEBUG = env("DEBUG")
SECRET_KEY = env("SECRET_KEY")
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS")
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_ALL_ORIGINS = DEBUG  # in production DEBUG=False so the explicit list is enforced
from corsheaders.defaults import default_headers
CORS_ALLOW_HEADERS = (*default_headers, "x-resto-session")
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS")
FRONTEND_URL = env("FRONTEND_URL")
OIDC_ISSUER_URL = env("OIDC_ISSUER_URL").rstrip("/")
OIDC_CLIENT_ID = env("OIDC_CLIENT_ID")
OIDC_CLIENT_SECRET = env("OIDC_CLIENT_SECRET")
GOOGLE_OAUTH_CLIENT_ID = env("GOOGLE_OAUTH_CLIENT_ID", default="")
GOOGLE_OAUTH_CLIENT_SECRET = env("GOOGLE_OAUTH_CLIENT_SECRET", default="")
GOOGLE_OAUTH_ALLOWED_ORIGINS = env.list("GOOGLE_OAUTH_ALLOWED_ORIGINS", default=CORS_ALLOWED_ORIGINS)
SQLITE_PATH = env("SQLITE_PATH")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "social_django",
    "api",
    "lulu",
    "resto",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": SQLITE_PATH or BASE_DIR / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Europe/Paris"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTHENTICATION_BACKENDS = [
    "api.backends.PascuansOIDCBackend",
    "django.contrib.auth.backends.ModelBackend",
]

SOCIAL_AUTH_URL_NAMESPACE = "social"
SOCIAL_AUTH_PASCUANS_OIDC_KEY = OIDC_CLIENT_ID
SOCIAL_AUTH_PASCUANS_OIDC_SECRET = OIDC_CLIENT_SECRET
SOCIAL_AUTH_FIELDS_STORED_IN_SESSION = ["role"]
SOCIAL_AUTH_LOGIN_REDIRECT_URL = "/api/auth/social/bridge/"
LOGIN_REDIRECT_URL = "/api/auth/social/bridge/"
SOCIAL_AUTH_PIPELINE = (
    "social_core.pipeline.social_auth.social_details",
    "social_core.pipeline.social_auth.social_uid",
    "social_core.pipeline.social_auth.auth_allowed",
    "social_core.pipeline.social_auth.social_user",
    "api.pipeline.associate_by_email",
    "social_core.pipeline.user.get_username",
    "social_core.pipeline.user.create_user",
    "social_core.pipeline.social_auth.associate_user",
    "social_core.pipeline.social_auth.load_extra_data",
    "social_core.pipeline.user.user_details",
    "api.pipeline.sync_pascuans_profile",
)

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "api.token_auth.ProfileTokenAuthentication",
    ],
}

USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
