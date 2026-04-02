using System.Windows;

namespace PreeceMeet.Views;

public partial class UserEditDialog : Window
{
    public string Email    { get; private set; } = string.Empty;
    public string Password { get; private set; } = string.Empty;

    public UserEditDialog(string title, bool requirePassword = true, bool emailReadOnly = false, string email = "")
    {
        InitializeComponent();
        Title              = title;
        TxtEmail.Text      = email;
        TxtEmail.IsEnabled = !emailReadOnly;
        if (emailReadOnly)
            LblEmail.Content = "Email (read-only)";
    }

    private void BtnOk_Click(object sender, RoutedEventArgs e)
    {
        if (TxtEmail.IsEnabled && string.IsNullOrWhiteSpace(TxtEmail.Text))
        {
            MessageBox.Show("Please enter an email address.", Title, MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        if (string.IsNullOrWhiteSpace(TxtPassword.Password))
        {
            MessageBox.Show("Please enter a password.", Title, MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        Email        = TxtEmail.Text.Trim().ToLowerInvariant();
        Password     = TxtPassword.Password;
        DialogResult = true;
        Close();
    }

    private void BtnCancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
