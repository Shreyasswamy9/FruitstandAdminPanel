import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

router.get('/login', (req, res) => {
  const errorMessage = req.query.error as string;
  const successMessage = req.query.success as string;

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Fruitstand Admin</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .login-container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            width: 100%;
            max-width: 420px;
            padding: 40px;
        }

        .logo {
            text-align: center;
            margin-bottom: 32px;
        }

        .logo h1 {
            font-size: 28px;
            color: #333;
            margin-bottom: 8px;
        }

        .logo p {
            color: #666;
            font-size: 14px;
        }

        .form-group {
            margin-bottom: 24px;
        }

        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #333;
            font-size: 14px;
        }

        input {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }

        input:focus {
            outline: none;
            border-color: #667eea;
        }

        button {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }

        button:active {
            transform: translateY(0);
        }

        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .alert {
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 24px;
            font-size: 14px;
        }

        .alert-error {
            background: #fee;
            color: #c33;
            border: 1px solid #fcc;
        }

        .alert-success {
            background: #efe;
            color: #3c3;
            border: 1px solid #cfc;
        }

        .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 0.8s linear infinite;
            margin-right: 8px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .loading-text {
            display: none;
        }

        button:disabled .loading-text {
            display: inline;
        }

        button:disabled .default-text {
            display: none;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">
            <h1>🍊 Fruitstand</h1>
            <p>Admin Panel</p>
        </div>

        ${errorMessage ? `<div class="alert alert-error">${errorMessage}</div>` : ''}
        ${successMessage ? `<div class="alert alert-success">${successMessage}</div>` : ''}

        <form id="loginForm" onsubmit="handleLogin(event)">
            <div class="form-group">
                <label for="email">Email</label>
                <input 
                    type="email" 
                    id="email" 
                    name="email" 
                    required 
                    autocomplete="email"
                    placeholder="your.email@fruitstandny.com"
                >
            </div>

            <div class="form-group">
                <label for="password">Password</label>
                <input 
                    type="password" 
                    id="password" 
                    name="password" 
                    required 
                    autocomplete="current-password"
                    placeholder="Enter your password"
                >
            </div>

            <button type="submit" id="loginBtn">
                <span class="default-text">Sign In</span>
                <span class="loading-text">
                    <span class="spinner"></span>
                    Signing in...
                </span>
            </button>
        </form>
    </div>

    <script>
        async function handleLogin(event) {
            event.preventDefault();
            
            const form = event.target;
            const button = document.getElementById('loginBtn');
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            button.disabled = true;

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email, password }),
                });

                const data = await response.json();

                if (response.ok) {
                    if (data.requiresPasswordChange) {
                        window.location.href = '/change-password?first=true';
                    } else {
                        window.location.href = '/dashboard';
                    }
                } else {
                    window.location.href = '/login?error=' + encodeURIComponent(data.error || 'Login failed');
                }
            } catch (error) {
                window.location.href = '/login?error=' + encodeURIComponent('Network error. Please try again.');
            }
        }
    </script>
</body>
</html>
  `);
});

router.get('/change-password', (req, res) => {
  const isFirstTime = req.query.first === 'true';
  const errorMessage = req.query.error as string;
  const successMessage = req.query.success as string;

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Change Password - Fruitstand Admin</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .change-password-container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            width: 100%;
            max-width: 420px;
            padding: 40px;
        }

        .logo {
            text-align: center;
            margin-bottom: 32px;
        }

        .logo h1 {
            font-size: 28px;
            color: #333;
            margin-bottom: 8px;
        }

        .logo p {
            color: #666;
            font-size: 14px;
        }

        .info-box {
            background: #f0f4ff;
            border-left: 4px solid #667eea;
            padding: 16px;
            margin-bottom: 24px;
            border-radius: 8px;
        }

        .info-box p {
            color: #333;
            font-size: 14px;
            line-height: 1.6;
        }

        .form-group {
            margin-bottom: 24px;
        }

        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #333;
            font-size: 14px;
        }

        input {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }

        input:focus {
            outline: none;
            border-color: #667eea;
        }

        .password-requirements {
            margin-top: 8px;
            font-size: 12px;
            color: #666;
        }

        button {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }

        button:active {
            transform: translateY(0);
        }

        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .alert {
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 24px;
            font-size: 14px;
        }

        .alert-error {
            background: #fee;
            color: #c33;
            border: 1px solid #fcc;
        }

        .alert-success {
            background: #efe;
            color: #3c3;
            border: 1px solid #cfc;
        }

        .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 0.8s linear infinite;
            margin-right: 8px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .loading-text {
            display: none;
        }

        button:disabled .loading-text {
            display: inline;
        }

        button:disabled .default-text {
            display: none;
        }
    </style>
</head>
<body>
    <div class="change-password-container">
        <div class="logo">
            <h1>🍊 Fruitstand</h1>
            <p>Change Password</p>
        </div>

        ${isFirstTime ? `
        <div class="info-box">
            <p><strong>Welcome!</strong> Please change your temporary password to secure your account.</p>
        </div>
        ` : ''}

        ${errorMessage ? `<div class="alert alert-error">${errorMessage}</div>` : ''}
        ${successMessage ? `<div class="alert alert-success">${successMessage}</div>` : ''}

        <form id="changePasswordForm" onsubmit="handleChangePassword(event)">
            <div class="form-group">
                <label for="currentPassword">Current Password</label>
                <input 
                    type="password" 
                    id="currentPassword" 
                    name="currentPassword" 
                    required 
                    autocomplete="current-password"
                    placeholder="Enter your current password"
                >
            </div>

            <div class="form-group">
                <label for="newPassword">New Password</label>
                <input 
                    type="password" 
                    id="newPassword" 
                    name="newPassword" 
                    required 
                    autocomplete="new-password"
                    placeholder="Enter your new password"
                >
                <div class="password-requirements">
                    Must be at least 8 characters long
                </div>
            </div>

            <div class="form-group">
                <label for="confirmPassword">Confirm New Password</label>
                <input 
                    type="password" 
                    id="confirmPassword" 
                    name="confirmPassword" 
                    required 
                    autocomplete="new-password"
                    placeholder="Confirm your new password"
                >
            </div>

            <button type="submit" id="changePasswordBtn">
                <span class="default-text">Change Password</span>
                <span class="loading-text">
                    <span class="spinner"></span>
                    Changing...
                </span>
            </button>
        </form>
    </div>

    <script>
        async function handleChangePassword(event) {
            event.preventDefault();
            
            const button = document.getElementById('changePasswordBtn');
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (newPassword !== confirmPassword) {
                window.location.href = '/change-password?first=${isFirstTime}&error=' + encodeURIComponent('Passwords do not match');
                return;
            }

            if (newPassword.length < 8) {
                window.location.href = '/change-password?first=${isFirstTime}&error=' + encodeURIComponent('Password must be at least 8 characters');
                return;
            }

            button.disabled = true;

            try {
                const response = await fetch('/api/auth/change-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ currentPassword, newPassword }),
                });

                const data = await response.json();

                if (response.ok) {
                    window.location.href = '/login?success=' + encodeURIComponent('Password changed successfully. Please log in with your new password.');
                } else {
                    window.location.href = '/change-password?first=${isFirstTime}&error=' + encodeURIComponent(data.error || 'Failed to change password');
                }
            } catch (error) {
                window.location.href = '/change-password?first=${isFirstTime}&error=' + encodeURIComponent('Network error. Please try again.');
            }
        }
    </script>
</body>
</html>
  `);
});

export default router;
