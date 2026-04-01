using System.IO;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using PreeceMeet.Models;
using PreeceMeet.Services;
using QRCoder;

namespace PreeceMeet.Views;

public partial class TotpSetupWindow : Window
{
    private readonly AuthService _authService;
    private readonly string      _tempToken;
    private bool _inFlight;

    public VerifyTotpResponse? AuthResult { get; private set; }

    public TotpSetupWindow(AuthService authService, string tempToken, string otpUri, string secret)
    {
        _authService = authService;
        _tempToken   = tempToken;

        InitializeComponent();

        TxtSecret.Text = secret;
        ImgQr.Source   = GenerateQr(otpUri);
        TxtCode.Focus();
    }

    private static BitmapSource GenerateQr(string text)
    {
        using var generator = new QRCodeGenerator();
        using var data      = generator.CreateQrCode(text, QRCodeGenerator.ECCLevel.M);
        using var qr        = new PngByteQRCode(data);

        var png = qr.GetGraphic(10);

        using var ms = new MemoryStream(png);
        var bitmap = new BitmapImage();
        bitmap.BeginInit();
        bitmap.CacheOption  = BitmapCacheOption.OnLoad;
        bitmap.StreamSource = ms;
        bitmap.EndInit();
        bitmap.Freeze();
        return bitmap;
    }

    private async void BtnVerify_Click(object sender, RoutedEventArgs e)
        => await DoVerifyAsync();

    private async void TxtCode_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Return) await DoVerifyAsync();
    }

    private void TxtCode_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
    {
        if (TxtCode.Text.Length == 6 && TxtCode.Text.All(char.IsDigit))
            _ = DoVerifyAsync();
    }

    private async Task DoVerifyAsync()
    {
        if (_inFlight) return;

        var code = TxtCode.Text.Trim();
        if (code.Length != 6 || !code.All(char.IsDigit))
        {
            ShowError("Please enter the 6-digit code.");
            return;
        }

        _inFlight = true;
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
            _inFlight = false;
            SetBusy(false);
        }
    }

    private void SetBusy(bool busy)
    {
        BtnVerify.IsEnabled = !busy;
        TxtCode.IsEnabled   = !busy;
        BtnVerify.Content   = busy ? "Verifying..." : "Confirm and Sign In";
    }

    private void ShowError(string msg) { TxtError.Text = msg; TxtError.Visibility = Visibility.Visible; }
    private void HideError()           => TxtError.Visibility = Visibility.Collapsed;
}
