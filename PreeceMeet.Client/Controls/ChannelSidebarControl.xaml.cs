using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using PreeceMeet.Models;

namespace PreeceMeet.Controls;

public partial class ChannelSidebarControl : UserControl
{
    public event Action<ChannelInfo>? ChannelJoinRequested;
    public event Action?              AddChannelRequested;
    public event Action?              SettingsRequested;
    public event Action?              SignOutRequested;

    private ChannelInfo? _activeChannel;

    public ChannelSidebarControl()
    {
        InitializeComponent();
    }

    public void BindChannels(ObservableCollection<ChannelInfo> channels)
    {
        ChannelList.ItemsSource = channels;
    }

    public void SetUser(string email)
    {
        TxtUserEmail.Text      = email;
        TxtAvatarInitial.Text  = email.Length > 0 ? email[0].ToString().ToUpperInvariant() : "?";
    }

    public void SetActiveChannel(ChannelInfo? channel)
    {
        if (_activeChannel is not null)
            _activeChannel.IsJoined = false;

        _activeChannel = channel;

        if (_activeChannel is not null)
        {
            _activeChannel.IsJoined    = true;
            _activeChannel.HasActivity = false; // clear activity dot when joining
        }
    }

    private void Channel_Click(object sender, MouseButtonEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is ChannelInfo ch)
            ChannelJoinRequested?.Invoke(ch);
    }

    private void BtnAddChannel_Click(object sender, RoutedEventArgs e)
        => AddChannelRequested?.Invoke();

    private void Footer_Click(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (sender is Border b)
        {
            b.ContextMenu.IsOpen = true;
            e.Handled = true;
        }
    }

    private void MenuSettings_Click(object sender, RoutedEventArgs e)
        => SettingsRequested?.Invoke();

    private void MenuSignOut_Click(object sender, RoutedEventArgs e)
        => SignOutRequested?.Invoke();
}
