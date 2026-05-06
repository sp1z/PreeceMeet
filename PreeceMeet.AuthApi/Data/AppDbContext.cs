using Microsoft.EntityFrameworkCore;
using PreeceMeet.AuthApi.Models;

namespace PreeceMeet.AuthApi.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User>        Users        => Set<User>();
    public DbSet<DeviceToken> DeviceTokens => Set<DeviceToken>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(e =>
        {
            e.HasKey(u => u.Id);
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.Email).IsRequired().HasMaxLength(256);
            e.Property(u => u.PasswordHash).IsRequired();
            e.Property(u => u.TotpSecret).IsRequired();
        });

        modelBuilder.Entity<DeviceToken>(e =>
        {
            e.HasKey(d => d.Id);
            e.HasIndex(d => new { d.Email, d.Token }).IsUnique();
            e.HasIndex(d => d.Email);
            e.Property(d => d.Email).IsRequired().HasMaxLength(256);
            e.Property(d => d.Platform).IsRequired().HasMaxLength(16);
            e.Property(d => d.Token).IsRequired().HasMaxLength(512);
        });
    }
}
