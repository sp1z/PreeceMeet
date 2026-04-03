using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using PreeceMeet.Models;

namespace PreeceMeet.Views;

public partial class AddChannelDialog : Window
{
    public string ChannelName  => TxtName.Text.Trim().ToLowerInvariant();
    public string DisplayName  => TxtDisplay.Text.Trim();
    public string Emoji        => TxtEmoji.Text.Trim();

    public AddChannelDialog()
    {
        InitializeComponent();
        Loaded += (_, _) => TxtName.Focus();
    }

    /// <summary>Pre-populate for editing an existing channel.</summary>
    public AddChannelDialog(ChannelConfig existing) : this()
    {
        TxtName.Text    = existing.Name;
        TxtDisplay.Text = existing.DisplayName;
        TxtEmoji.Text   = existing.Emoji;
        // Don't allow renaming the room key (could confuse the server).
        TxtName.IsEnabled = false;
        Title = "Edit Channel";
    }

    private void EmojiPick_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn)
            TxtEmoji.Text = btn.Content?.ToString() ?? string.Empty;
    }

    private void BtnAdd_Click(object sender, RoutedEventArgs e) => TryAccept();
    private void BtnCancel_Click(object sender, RoutedEventArgs e) { DialogResult = false; }
    private void Txt_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Return) TryAccept(); }

    private void TryAccept()
    {
        if (string.IsNullOrWhiteSpace(TxtName.Text))
        {
            MessageBox.Show("Please enter a room name.", "PreeceMeet",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        DialogResult = true;
    }
}
