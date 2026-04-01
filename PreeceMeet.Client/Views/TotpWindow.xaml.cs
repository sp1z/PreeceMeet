using System.Windows;
using System.Windows.Input;
using PreeceMeet.Models;
using PreeceMeet.Services;

namespace PreeceMeet.Views;

public partial class TotpWindow : Window
{
    private readonly AuthService _authService;
    private readonly string _tempToken;

    public VerifyTotpResponse? AuthResult { get; private set; }

    public TotpWindow(AuthService authService, string tempToken)
    {
        _authService = authService;
        _tempToken   = tempToken;
        InitializeComponent();
        TxtCode.Focus();
    }

    private async void BtnVerify_Click(object sender, RoutedEventArgs e)
        => await DoVerifyAsync();

    private async void TxtCode_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Return)
            await DoVerifyAsync();
    }

    private void TxtCode_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
    {
        if (TxtCode.Text.Length == 6 && TxtCode.Text.All(char.IsDigit))
            _ = DoVerifyAsync();
    }

    private async Task DoVerifyAsync()
    {
        var code = TxtCode.Text.Trim();
        if (code.Length != 6 || !code.All(char.IsDigit))
        {
            ShowError("Please enter the 6-digit code.");
            return;
        }

        SetBusy(true);
        HideError();

        try
        {
            AuthResult   = await _authService.VerifyTotpAsync(_tempToken, code);
            DialogResult = true;
            Close();
        }
        catch (Exception ex)
        {
            ShowError($"Verification failed: {ex.Message}");
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void SetBusy(bool busy)
    {
        BtnVerify.IsEnabled = !busy;
        TxtCode.IsEnabled   = !busy;
        BtnVerify.Content   = busy ? "Verifying..." : "Verify";
    }

    private void ShowError(string msg)
    {
        TxtError.Text       = msg;
        TxtError.Visibility = Visibility.Visible;
    }

    private void HideError()
        => TxtError.Visibility = Visibility.Collapsed;
}
