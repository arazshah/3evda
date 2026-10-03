from django.urls import path

from . import api

urlpatterns = [
    path("csrf", api.CsrfView.as_view(), name="auth-csrf"),
    path("me", api.MeView.as_view(), name="auth-me"),
    path("login", api.LoginView.as_view(), name="auth-login"),
    path("verify", api.VerifyView.as_view(), name="auth-verify"),
    path("totp/setup", api.TotpSetupView.as_view(), name="auth-totp-setup"),
    path("totp/confirm", api.TotpConfirmView.as_view(), name="auth-totp-confirm"),
    path("recovery-codes", api.RecoveryCodesView.as_view(), name="auth-recovery-codes"),
    path("password", api.PasswordChangeView.as_view(), name="auth-password"),
    path("logout", api.LogoutView.as_view(), name="auth-logout"),
]
