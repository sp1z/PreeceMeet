using System.Windows;
using System.Windows.Input;
using PreeceMeet.Models;
using PreeceMeet.Services;

namespace PreeceMeet.Views;

public partial class LoginWindow : Window
{
    private readonly AuthService _authService;
    private readonly SettingsService _settingsService;

    public VerifyTotpResponse? AuthResult { get; private set; }

    public LoginWindow(AuthService authService, SettingsService settingsService)
    {
        _authService     = authService;
        _settingsService = settingsService;

        InitializeComponent();

        var settings = _settingsService.Current;
        if (!string.IsNullOrEmpty(settings.SavedEmail))
            TxtEmail.Text = settings.SavedEmail;
    }

    private async void BtnLogin_Click(object sender, RoutedEventArgs e)
        => await DoLoginAsync();

    private async void Input_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Return)
            await DoLoginAsync();
    }

    private async Task DoLoginAsync()
    {
        var email    = TxtEmail.Text.Trim();
        var password = TxtPassword.Password;

        if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password))
        {
            ShowError("Please enter your email and password.");
            return;
        }

        SetBusy(true);
        HideError();

        try
        {
            var loginResult = await _authService.LoginAsync(email, password);

            if (loginResult.RequireTotp)
            {
                VerifyTotpResponse? result;

                var displayName = _settingsService.Current.DisplayName;

                if (loginResult.TotpSetup)
                {
                    // First login — show QR setup window.
                    var setupWindow = new TotpSetupWindow(
                        _authService, loginResult.TempToken,
                        loginResult.OtpUri, loginResult.TotpSecret, displayName) { Owner = this };
                    if (setupWindow.ShowDialog() != true || setupWindow.AuthResult is null) return;
                    result = setupWindow.AuthResult;
                }
                else
                {
                    // Normal login — ask for code.
                    var totpWindow = new TotpWindow(_authService, loginResult.TempToken, displayName) { Owner = this };
                    if (totpWindow.ShowDialog() != true || totpWindow.AuthResult is null) return;
                    result = totpWindow.AuthResult;
                }

                PersistRememberMe(email);
                AuthResult   = result;
                DialogResult = true;
                Close();
            }
            else
            {
                ShowError("Server did not request TOTP - unexpected flow.");
            }
        }
        catch (Exception ex)
        {
            ShowError($"Login failed: {ex.Message}");
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void PersistRememberMe(string email)
    {
        _settingsService.Current.SavedEmail = email;
        _settingsService.Save();
    }

    private void SetBusy(bool busy)
    {
        BtnLogin.IsEnabled    = !busy;
        TxtEmail.IsEnabled    = !busy;
        TxtPassword.IsEnabled = !busy;
        BtnLogin.Content      = busy ? "Signing in..." : "Sign In";
    }

    private void ShowError(string msg)
    {
        TxtError.Text       = msg;
        TxtError.Visibility = Visibility.Visible;
    }

    private void HideError()
        => TxtError.Visibility = Visibility.Collapsed;
}
