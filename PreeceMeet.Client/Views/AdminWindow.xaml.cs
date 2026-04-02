using System.Windows;
using System.Windows.Controls;
using PreeceMeet.Models;
using PreeceMeet.Services;

namespace PreeceMeet.Views;

public partial class AdminWindow : Window
{
    private readonly AdminService   _admin;
    private readonly SettingsService _settings;

    public AdminWindow(AdminService admin, SettingsService settings)
    {
        _admin    = admin;
        _settings = settings;
        InitializeComponent();
        TxtAdminKey.Password = _settings.Current.AdminKey;
        _ = LoadUsersAsync();
    }

    private string AdminKey => TxtAdminKey.Password;

    // ── Load ──────────────────────────────────────────────────────────────────

    private async Task LoadUsersAsync()
    {
        if (string.IsNullOrWhiteSpace(AdminKey)) { ShowError("Enter the admin key above."); return; }
        HideError();
        SetStatus("Loading...");
        try
        {
            var users = await _admin.GetUsersAsync(AdminKey);
            UsersGrid.ItemsSource = users;
            SetStatus($"{users.Count} user{(users.Count == 1 ? "" : "s")}");
            // Persist key if successful.
            _settings.Current.AdminKey = AdminKey;
            _settings.Save();
        }
        catch (Exception ex) { ShowError($"Failed to load users: {ex.Message}"); HideStatus(); }
    }

    private void BtnReload_Click(object sender, RoutedEventArgs e)
        => _ = LoadUsersAsync();

    // ── Selection ─────────────────────────────────────────────────────────────

    private void UsersGrid_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        bool sel = UsersGrid.SelectedItem is UserInfo;
        BtnChangePassword.IsEnabled = sel;
        BtnResetTotp.IsEnabled      = sel;
        BtnDelete.IsEnabled         = sel;
    }

    private UserInfo? SelectedUser => UsersGrid.SelectedItem as UserInfo;

    // ── Add user ──────────────────────────────────────────────────────────────

    private async void BtnAdd_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new UserEditDialog("Add User", requirePassword: true) { Owner = this };
        if (dlg.ShowDialog() != true) return;
        try
        {
            SetStatus("Creating user...");
            await _admin.CreateUserAsync(AdminKey, dlg.Email, dlg.Password);
            await LoadUsersAsync();
        }
        catch (Exception ex) { ShowError($"Failed to create user: {ex.Message}"); HideStatus(); }
    }

    // ── Change password ───────────────────────────────────────────────────────

    private async void BtnChangePassword_Click(object sender, RoutedEventArgs e)
    {
        if (SelectedUser is null) return;
        var dlg = new UserEditDialog($"Change Password — {SelectedUser.Email}", requirePassword: true, emailReadOnly: true, email: SelectedUser.Email) { Owner = this };
        if (dlg.ShowDialog() != true) return;
        try
        {
            SetStatus("Updating password...");
            await _admin.ChangePasswordAsync(AdminKey, SelectedUser.Email, dlg.Password);
            SetStatus("Password updated.");
        }
        catch (Exception ex) { ShowError($"Failed: {ex.Message}"); HideStatus(); }
    }

    // ── Reset TOTP ────────────────────────────────────────────────────────────

    private async void BtnResetTotp_Click(object sender, RoutedEventArgs e)
    {
        if (SelectedUser is null) return;
        var confirm = MessageBox.Show(
            $"Reset TOTP for {SelectedUser.Email}?\nThey will need to re-scan the QR code on next login.",
            "Reset TOTP", MessageBoxButton.YesNo, MessageBoxImage.Question);
        if (confirm != MessageBoxResult.Yes) return;
        try
        {
            SetStatus("Resetting TOTP...");
            await _admin.ResetTotpAsync(AdminKey, SelectedUser.Email);
            await LoadUsersAsync();
        }
        catch (Exception ex) { ShowError($"Failed: {ex.Message}"); HideStatus(); }
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    private async void BtnDelete_Click(object sender, RoutedEventArgs e)
    {
        if (SelectedUser is null) return;
        var confirm = MessageBox.Show(
            $"Permanently delete {SelectedUser.Email}?",
            "Delete User", MessageBoxButton.YesNo, MessageBoxImage.Warning);
        if (confirm != MessageBoxResult.Yes) return;
        try
        {
            SetStatus("Deleting...");
            await _admin.DeleteUserAsync(AdminKey, SelectedUser.Email);
            await LoadUsersAsync();
        }
        catch (Exception ex) { ShowError($"Failed: {ex.Message}"); HideStatus(); }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void ShowError(string msg)  { TxtError.Text = msg; TxtError.Visibility = Visibility.Visible; }
    private void HideError()            => TxtError.Visibility = Visibility.Collapsed;
    private void SetStatus(string msg)  { TxtStatus.Text = msg; TxtStatus.Visibility = Visibility.Visible; }
    private void HideStatus()           => TxtStatus.Visibility = Visibility.Collapsed;
}
