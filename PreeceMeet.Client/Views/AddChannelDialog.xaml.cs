using System.Windows;
using System.Windows.Input;

namespace PreeceMeet.Views;

public partial class AddChannelDialog : Window
{
    public string ChannelName  => TxtName.Text.Trim().ToLowerInvariant();
    public string DisplayName  => TxtDisplay.Text.Trim();

    public AddChannelDialog()
    {
        InitializeComponent();
        Loaded += (_, _) => TxtName.Focus();
    }

    private void BtnAdd_Click(object sender, RoutedEventArgs e) => TryAccept();
    private void BtnCancel_Click(object sender, RoutedEventArgs e) { DialogResult = false; }
    private void Txt_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Return) TryAccept(); }

    private void TryAccept()
    {
        if (string.IsNullOrWhiteSpace(TxtName.Text))
        {
            MessageBox.Show("Please enter a channel name.", "PreeceMeet",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        DialogResult = true;
    }
}
