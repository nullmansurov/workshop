import sys
from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for, flash
import os
import json
import shutil
import re
import time
import subprocess
from google import genai
from datetime import datetime, timedelta
from flask import session

# Import classes for authentication and working with forms
from flask_login import LoginManager, login_required, current_user, login_user, logout_user, UserMixin
from flask_sqlalchemy import SQLAlchemy
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField, SelectField
from wtforms.validators import DataRequired, Length
from functools import wraps
from flask import send_from_directory, abort
from werkzeug.utils import secure_filename
from flask import Response, stream_with_context
import os, mimetypes

# Decorator for checking roles
def roles_required(*allowed_roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if current_user.role not in allowed_roles:
                flash("Access denied!", "danger")
                return redirect(url_for("library"))
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# Initializing the Flask application
app = Flask(__name__)
app.secret_key = 'supersecretkey' 

# DB configuration for storing users
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///users.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)

# Initializing Flask-Login
login_manager = LoginManager(app)
login_manager.login_view = 'login'  # if not authorized, redirects to /login

# ===================== User Model =====================
class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(20), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(10), nullable=False, default="user")  # New column

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# ===================== Form for creating a user (admin panel) =====================
ROLES = ["viewer", "user", "admin"]

class CreateUserForm(FlaskForm):
    username = StringField("Username", validators=[DataRequired(), Length(min=3, max=20)])
    password = PasswordField("Password", validators=[DataRequired(), Length(min=6)])
    role = SelectField("Role", choices=[(r, r) for r in ROLES], validators=[DataRequired()])
    submit = SubmitField("Create User")

# ===================== Directory Paths =====================
# Use the directory where main.py is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(BASE_DIR, 'templates')
PROJECTS_DIR = os.path.join(BASE_DIR, 'projects')

# Setting up the templates folder
app.template_folder = TEMPLATE_DIR

# Creating necessary directories if they don't exist yet
os.makedirs(PROJECTS_DIR, exist_ok=True)
os.makedirs(TEMPLATE_DIR, exist_ok=True)

# ===================== Functions for working with favorite projects =====================
def load_favorites():
    fav_path = os.path.join(PROJECTS_DIR, '.favorites.json')
    if os.path.exists(fav_path):
        with open(fav_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_favorites(favorites):
    fav_path = os.path.join(PROJECTS_DIR, '.favorites.json')
    with open(fav_path, 'w', encoding='utf-8') as f:
        json.dump(favorites, f, ensure_ascii=False)

# ===================== API for working with projects =====================

# Only for users with "user" and "admin" roles (viewer does not have access)
@app.route('/rename_project', methods=['POST'])
@login_required
@roles_required("user", "admin")
def rename_project():
    old_name = request.form.get('old_name')
    new_name = request.form.get('new_name')
    if not old_name or not new_name:
        return jsonify({'success': False, 'error': 'Both names are required'}), 400
    if not re.match(r'^[a-zA-Zа-яА-ЯёЁ0-9_ \-]+$', new_name):
        return jsonify({
            'success': False,
            'error': 'Invalid characters. Allowed: letters, numbers, spaces, - and _'
        }), 400
    old_path = os.path.join(PROJECTS_DIR, old_name)
    new_path = os.path.join(PROJECTS_DIR, new_name)
    if not os.path.exists(old_path):
        return jsonify({'success': False, 'error': 'Source project not found'}), 404
    if os.path.exists(new_path):
        return jsonify({'success': False, 'error': 'A project with this name already exists'}), 409
    try:
        os.rename(old_path, new_path)
        # Updating the favorites list
        favorites = load_favorites()
        updated_favorites = [new_name if name == old_name else name for name in favorites]
        save_favorites(updated_favorites)
        return jsonify({'success': True, 'new_name': new_name})
    except Exception as e:
        return jsonify({'success': False, 'error': f'Server error: {str(e)}'}), 500

# Only for users with "user" and "admin" roles
@app.route('/favorite_project', methods=['POST'])
@login_required
@roles_required("user", "admin")
def favorite_project():
    project_name = request.form.get('project_name')
    action = request.form.get('action')
    if not project_name or action not in ['add', 'remove']:
        return jsonify({'success': False, 'error': 'Invalid parameters'})
    favorites = load_favorites()
    if action == 'add':
        if project_name not in favorites:
            favorites.append(project_name)
    elif action == 'remove':
        if project_name in favorites:
            favorites.remove(project_name)
    save_favorites(favorites)
    return jsonify({'success': True, 'favorites': favorites})

# No role restrictions (viewing favorites)
@app.route('/load_favorites', methods=['GET'])
@login_required
def load_favorites_route():
    return jsonify({'success': True, 'favorites': load_favorites()})

# Deleting projects – only for **admin**
@app.route('/delete_project', methods=['POST'])
@login_required
@roles_required("admin")
def delete_project():
    project_name = request.form.get('project_name')
    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'})
    project_path = os.path.join(PROJECTS_DIR, project_name)
    if not os.path.exists(project_path):
        return jsonify({'success': False, 'error': 'Project not found'})
    try:
        shutil.rmtree(project_path)
        # Updating favorites
        favorites = load_favorites()
        if project_name in favorites:
            favorites.remove(project_name)
            save_favorites(favorites)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/create_project', methods=['POST'])
@login_required
@roles_required("user", "admin")
def create_project():
    project_name = request.form.get('project_name', '').strip()  # remove spaces
    
    if not project_name:
        # Return an error if the name is empty or missing
        return jsonify({'success': False, 'error': 'Project name required'})
    
    project_path = os.path.join(PROJECTS_DIR, project_name)
    
    if os.path.exists(project_path):
        # If a project with this name already exists, also an error
        return jsonify({'success': False, 'error': 'Project already exists'})
    
    try:
        # Create the project folder
        os.makedirs(project_path)

        # Create a basic index.html in the project
        index_file = os.path.join(project_path, 'index.html')
        with open(index_file, 'w', encoding='utf-8') as f:
            f.write(f"""<!DOCTYPE html>
<html>
<head>
  <meta charset='UTF-8'>
  <title>{project_name}</title>
</head>
<body>
  <!-- Project content -->
</body>
</html>""")

        # Return the project name to the frontend so it can be opened
        return jsonify({'success': True, 'project': project_name})
    
    except Exception as e:
        # If something went wrong — return an error
        return jsonify({'success': False, 'error': str(e)})

# Global dictionary for storing information on project editing
active_project_edits = {}
EDIT_TIMEOUT = timedelta(seconds=30)

def can_user_edit_project(user, project_name):
    project_path = os.path.join(PROJECTS_DIR, project_name)
    visibilities = ProjectVisibility.query.filter_by(project_path=project_path).all()

    # admin can always edit
    if user.role == 'admin':
        return True

    # if there are no records — user can edit
    if not visibilities and user.role == 'user':
        return True

    # if the user is explicitly mentioned — they can edit
    if any(v.user_id == user.id for v in visibilities):
        return True

    # if there is an admin among the records — user cannot edit
    if any(v.role == 'admin' for v in visibilities):
        return False

    # if there is a user or viewer — user can edit
    if user.role == 'user':
        if any(v.user_id is None and v.role in ['user', 'viewer'] for v in visibilities):
            return True

    return False  # in all other cases, it is not allowed

@app.route('/load_project', methods=['GET'])
@login_required
def load_project():
    project_name = request.args.get('project_name')
    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'})

    project_file = os.path.join(PROJECTS_DIR, project_name, 'index.html')
    if not os.path.exists(project_file):
        return jsonify({'success': False, 'error': 'Project not found'})

    try:
        with open(project_file, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

    user = current_user
    now = datetime.now()
    username = user.username

    has_edit_rights = can_user_edit_project(user, project_name)
    can_edit = False
    editor_username = None
    notify_client = False
    in_queue = False
    became_editor_after_queue = False  # New flag

    if not has_edit_rights:
        # User cannot edit — observer mode, not added to the queue
        return jsonify({
            'success': True,
            'content': content,
            'can_edit': False,
            'editor': active_project_edits.get(project_name, {}).get('editor', None),
            'notify': False,
            'in_queue': False,
            'became_editor_after_queue': False
        })

    # Has editing rights
    if project_name not in active_project_edits:
        # No active editor — we become one immediately, without a queue
        active_project_edits[project_name] = {
            'editor': username,
            'last_heartbeat': now,
            'waiting': []
        }
        can_edit = True
        editor_username = username
        # Do not notify — the user immediately became the editor
        became_editor_after_queue = False
    else:
        record = active_project_edits[project_name]
        editor_username = record['editor']

        # Check if the editor's timeout has expired
        if now - record['last_heartbeat'] > EDIT_TIMEOUT:
            if record['waiting']:
                new_editor = record['waiting'].pop(0)['user']
                became_editor_after_queue = (new_editor == username)
            else:
                new_editor = username
                became_editor_after_queue = False
            record['editor'] = new_editor
            record['last_heartbeat'] = now
            editor_username = new_editor
            notify_client = (new_editor == username)
        else:
            became_editor_after_queue = False

        record = active_project_edits[project_name]  # update the record after changes

        if record['editor'] == username:
            # We are the editor
            record['last_heartbeat'] = now
            can_edit = True
        else:
            # We are not the editor, possibly in the queue
            already_waiting = any(entry['user'] == username for entry in record['waiting'])
            if not already_waiting:
                record['waiting'].append({'user': username, 'last_heartbeat': now})
                notify_client = True
                in_queue = True
            else:
                for entry in record['waiting']:
                    if entry['user'] == username:
                        entry['last_heartbeat'] = now
                        break
                in_queue = True
            can_edit = False

        # Clearing the queue of inactive users
        record['waiting'] = [
            entry for entry in record['waiting']
            if now - entry['last_heartbeat'] < EDIT_TIMEOUT
        ]

    return jsonify({
        'success': True,
        'content': content,
        'can_edit': can_edit,
        'editor': editor_username,
        'notify': notify_client,
        'in_queue': in_queue,
        'became_editor_after_queue': became_editor_after_queue
    })


@app.route('/heartbeat', methods=['POST'])
@login_required
def heartbeat():
    project_name = request.form.get('project_name')
    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'})

    user = current_user
    username = user.username
    now = datetime.now()

    if project_name not in active_project_edits:
        return jsonify({'success': False, 'error': 'Project not loaded'})

    if not can_user_edit_project(user, project_name):
        # No rights — just an observer, not in the queue
        record = active_project_edits[project_name]
        return jsonify({
            'success': True,
            'can_edit': False,
            'editor': record.get('editor'),
            'notify': False,
            'in_queue': False,
            'became_editor_after_queue': False
        })

    record = active_project_edits[project_name]
    notify_client = False
    in_queue = False
    became_editor_after_queue = False

    # Checking for editor timeout
    editor_timed_out = now - record['last_heartbeat'] > EDIT_TIMEOUT
    editor_username = record['editor']

    if editor_timed_out:
        if record['waiting']:
            new_editor = record['waiting'].pop(0)['user']
            became_editor_after_queue = (new_editor == username)
        else:
            new_editor = username
            became_editor_after_queue = False

        record['editor'] = new_editor
        record['last_heartbeat'] = now
        editor_username = new_editor
        notify_client = (new_editor == username)
    else:
        became_editor_after_queue = False
        if record['editor'] == username:
            # User is still the active editor
            record['last_heartbeat'] = now
        else:
            # User is not the editor — possibly in the queue
            found = False
            for entry in record['waiting']:
                if entry['user'] == username:
                    entry['last_heartbeat'] = now
                    found = True
                    break
            if not found:
                record['waiting'].append({'user': username, 'last_heartbeat': now})
                notify_client = True
            in_queue = True

    # Clearing the queue of inactive users
    record['waiting'] = [
        entry for entry in record['waiting']
        if now - entry['last_heartbeat'] < EDIT_TIMEOUT
    ]

    can_edit = (record['editor'] == username)

    return jsonify({
        'success': True,
        'can_edit': can_edit,
        'editor': record['editor'],
        'notify': notify_client,
        'in_queue': in_queue,
        'became_editor_after_queue': became_editor_after_queue
    })



# Endpoint to get project content without changing the lock (for auto-refresh for those waiting)
@app.route('/get_project_content', methods=['GET'])
@login_required
def get_project_content():
    project_name = request.args.get('project_name')
    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'})
    
    project_file = os.path.join(PROJECTS_DIR, project_name, 'index.html')
    if not os.path.exists(project_file):
        return jsonify({'success': False, 'error': 'Project not found'})
    
    try:
        with open(project_file, 'r', encoding='utf-8') as f:
            content = f.read()
        return jsonify({'success': True, 'content': content})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
        
@app.route('/save_project', methods=['POST'])
@login_required
def save_project():
    project_name = request.form.get('project_name')
    content = request.form.get('content')
    try:
        chunk_number = int(request.form.get('chunk_number', 1))
        total_chunks = int(request.form.get('total_chunks', 1))
    except (ValueError, TypeError):
        chunk_number = 1
        total_chunks = 1

    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'})

    # Checking editing rights
    user = current_user
    if not can_user_edit_project(user, project_name):
        return jsonify({'success': False, 'error': 'You do not have permission to modify this project'})

    # Checking if the user is the active editor
    record = active_project_edits.get(project_name)
    now = datetime.now()

    if not record or record['editor'] != user.username:
        return jsonify({'success': False, 'error': 'Someone else is working on the project!'})

    # Updating heartbeat
    record['last_heartbeat'] = now

    # Writing content
    project_dir = os.path.join(PROJECTS_DIR, project_name)
    if not os.path.exists(project_dir):
        os.makedirs(project_dir)

    project_file = os.path.join(project_dir, 'index.html')
    try:
        # If this is the first chunk – overwrite, otherwise append
        mode = 'w' if chunk_number == 1 else 'a'
        with open(project_file, mode, encoding='utf-8') as f:
            f.write(content)

        # Additional logic upon completion of all chunks
        if chunk_number == total_chunks:
            # For example, update the project timestamp, log the event, etc.
            pass

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})



@app.route('/download_file', methods=['GET'])
def download_file():
    project_name = request.args.get('project_name')
    file_name = request.args.get('file_name')
    
    if not project_name or not file_name:
        return jsonify({'success': False, 'error': 'Project and file name are required'}), 400

    file_path = os.path.join(PROJECTS_DIR, project_name, file_name)
    
    if not os.path.exists(file_path):
        return jsonify({'success': False, 'error': 'File not found'}), 404

    def generate():
        with open(file_path, 'rb') as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                yield chunk

    mime_type = mimetypes.guess_type(file_name)[0] or 'application/octet-stream'
    response = Response(stream_with_context(generate()), mimetype=mime_type)
    response.headers["Content-Disposition"] = f"attachment; filename={file_name}"
    return response

@app.route('/upload_file', methods=['POST'])
@login_required
def upload_file():
    project_name = request.form.get('project_name')
    file = request.files.get('file')

    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'})

    if not file:
        return jsonify({'success': False, 'error': 'No file uploaded'})

    user = current_user
    if not can_user_edit_project(user, project_name):
        return jsonify({'success': False, 'error': 'You do not have permission to modify this project'})

    record = active_project_edits.get(project_name)
    now = datetime.now()

    if not record or record['editor'] != user.username:
        return jsonify({'success': False, 'error': 'Someone else is working on the project!'})

    # Updating heartbeat
    record['last_heartbeat'] = now

    project_path = os.path.join(PROJECTS_DIR, project_name)
    if not os.path.exists(project_path):
        return jsonify({'success': False, 'error': 'Project not found'})

    try:
        filename = file.filename
        file.save(os.path.join(project_path, filename))
        return jsonify({'success': True, 'filename': filename})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

        

# ==== Endpoint for setting the token ====

class GeminiToken(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(512), nullable=False)
    
@app.route('/gemini_token', methods=['POST'])
@login_required
@roles_required("admin")
def GeminiSetToken():
    token = request.json.get('token') or request.form.get('token')
    if not token:
        return jsonify({'success': False, 'error': 'Token is required'}), 400

    # Deleting old tokens (single storage)
    GeminiToken.query.delete()
    db.session.add(GeminiToken(token=token))
    db.session.commit()

    return jsonify({'success': True, 'message': 'Token saved'})

# ==== Endpoint for calling the Gemini API ====
@app.route('/gemini_api', methods=['POST'])
@login_required
@roles_required("user", "admin")
def GeminiAPI():
    if request.is_json:
        data = request.get_json()
        text = data.get('text')
    else:
        text = request.form.get('text')

    if not text:
        return jsonify({'success': False, 'error': 'The "text" parameter is required'}), 400

    try:
        token_entry = GeminiToken.query.first()
        if not token_entry:
            return jsonify({'success': False, 'error': 'Gemini token is not configured'}), 500

        from google import genai
        client = genai.Client(api_key=token_entry.token)
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=text
        )
        return jsonify({'success': True, 'response': response.text})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# Helper function to check for "public" status
def is_public_project(project):
    # Check SharedProject
    shared = SharedProject.query.filter(SharedProject.project_path.like(f"%/{project}/%")).first()
    if shared:
        return True

    # Check MainMenu
    main = MainMenu.query.first()
    if main and f"/{project}/" in main.project_path:
        return True

    return False

# Decorator that allows access either to authorized users or for public projects
def public_or_login_required(view_func):
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        project = kwargs.get('project')
        if current_user.is_authenticated or is_public_project(project):
            return view_func(*args, **kwargs)
        else:
            return abort(403)  # Forbidden
    return wrapper

# Serving project files
@app.route('/workspace/<project>/<filename>')
@public_or_login_required
def serve_workspace_file(project, filename):
    path = os.path.join(PROJECTS_DIR, project, filename)
    if not os.path.exists(path):
        return abort(404)
    file_size = os.path.getsize(path)
    mime_type = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
    range_header = request.headers.get('Range', None)

    if range_header:
        range_match = re.search(r'bytes=(\d+)-(\d*)', range_header)
        if range_match:
            start = int(range_match.group(1))
            end_str = range_match.group(2)
            end = int(end_str) if end_str else file_size - 1
        else:
            start, end = 0, file_size - 1
        length = end - start + 1

        def generate():
            with open(path, 'rb') as f:
                f.seek(start)
                remaining = length
                chunk_size = 65536
                while remaining > 0:
                    data = f.read(min(chunk_size, remaining))
                    if not data:
                        break
                    yield data
                    remaining -= len(data)

        response = Response(stream_with_context(generate()), status=206, mimetype=mime_type)
        response.headers.add('Content-Range', f'bytes {start}-{end}/{file_size}')
        response.headers.add('Accept-Ranges', 'bytes')
        response.headers.add('Content-Length', str(length))
        return response

    else:
        def generate():
            with open(path, 'rb') as f:
                chunk_size = 65536
                while True:
                    data = f.read(chunk_size)
                    if not data:
                        break
                    yield data

        response = Response(stream_with_context(generate()), mimetype=mime_type)
        response.headers.add('Accept-Ranges', 'bytes')
        response.headers.add('Content-Length', str(file_size))
        return response

@app.route('/styles.css')
def styles():
    return send_from_directory(app.template_folder, 'styles.css')

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory(os.path.join(app.template_folder, 'js'), filename)

# ===================== Authentication Routes =====================
@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('library'))
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        if user and user.password == password:
            login_user(user)
            flash("Login successful!", "success")
            return redirect(url_for('library'))
        else:
            flash("Invalid login or password!", "danger")
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash("You have been logged out", "info")
    return redirect(url_for('login'))

# ===================== Main Routes =====================
class MainMenu(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_path = db.Column(db.String(200), nullable=False)

@app.route('/get_main', methods=['POST'])
@login_required
@roles_required('admin')
def set_main_menu():
    """
    Admin sets the main screen by passing project_name (the project directory).
    """
    data = request.get_json() or request.form
    project_name = data.get('project_name')
    if not project_name:
        return jsonify({'success': False, 'error': 'project_name was not passed'}), 400

    # Form the absolute path to index.html inside the project folder
    project_path = os.path.join(PROJECTS_DIR, project_name, 'index.html')
    if not os.path.isfile(project_path):
        return jsonify({'success': False, 'error': 'index.html file not found at path: {}'.format(project_path)}), 404

    # Delete the old record and save the new one
    MainMenu.query.delete()
    db.session.add(MainMenu(project_path=project_path))
    db.session.commit()

    return jsonify({'success': True, 'message': 'Main screen updated'}), 200

@app.route('/get_name', methods=['GET'])
def get_main_project_name():
    main = MainMenu.query.first()
    if main and os.path.isfile(main.project_path):
        # project_path == .../PROJECTS_DIR/<project_name>/index.html
        project_name = os.path.basename(os.path.dirname(main.project_path))
        return jsonify({'success': True, 'project_name': project_name}), 200

    return jsonify({'success': False, 'error': 'Main project is not set'}), 404


@app.route('/')
def home():

    main = MainMenu.query.first()
    if main and os.path.isfile(main.project_path):
        try:
            with open(main.project_path, 'r', encoding='utf-8') as f:
                project_content = f.read()
            return render_template('main_menu.html', project_content=project_content)
        except Exception as e:
            # If reading suddenly fails
            return render_template('error.html', error=str(e)), 500

    # If the main screen is not set — redirect to login
    return redirect(url_for('login'))


class ProjectVisibility(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_path = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(10), nullable=False)  # viewer, user, admin
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)  # null — access by role, otherwise by user

    user = db.relationship('User', backref='project_visibilities')

@app.route('/visibility', methods=['GET', 'POST', 'DELETE'])
@login_required
@roles_required("user", "admin")
def manage_visibility():
    project_name = None
    if request.method == 'GET':
        project_name = request.args.get('project_name')
    else:
        data = request.get_json() if request.is_json else request.form
        project_name = data.get('project_name')

    if not project_name:
        return jsonify({'success': False, 'error': 'Specify project_name'})

    project_file = os.path.join(PROJECTS_DIR, project_name)

    # GET: return current visibility settings
    if request.method == 'GET':
        visibilities = ProjectVisibility.query.filter_by(project_path=project_file).all()
        result = []
        for v in visibilities:
            result.append({
                'id': v.id,
                'role': v.role,
                'user_id': v.user_id,
                'username': v.user.username if v.user else None
            })
        return jsonify({'success': True, 'visibilities': result})

    # POST: add or update visibility
    if request.method == 'POST':
        role = data.get('role')
        user_id = data.get('user_id')  # optional

        if role not in ['viewer', 'user', 'admin']:
            return jsonify({'success': False, 'error': 'Invalid role'})

        if user_id:
            # Checking user existence
            user = User.query.get(user_id)
            if not user:
                return jsonify({'success': False, 'error': 'User not found'})
            # Check if such specific access already exists
            exists = ProjectVisibility.query.filter_by(
                project_path=project_file,
                role=role,
                user_id=user_id
            ).first()
            if exists:
                return jsonify({'success': False, 'error': 'Such access is already assigned'})
            # Add individual access, NOT touching role-based records
            new_vis = ProjectVisibility(
                project_path=project_file,
                role=role,
                user=user
            )
            db.session.add(new_vis)
            db.session.commit()
            return jsonify({'success': True, 'message': 'Individual access added'})
        else:
            # Role-based access: overwrite the single role for everyone
            # Delete all existing role-based records (user_id is None)
            ProjectVisibility.query.filter_by(
                project_path=project_file,
                user_id=None
            ).delete()
            # Add a new role-based record
            new_vis = ProjectVisibility(
                project_path=project_file,
                role=role,
                user=None
            )
            db.session.add(new_vis)
            db.session.commit()
            return jsonify({'success': True, 'message': 'Role-based visibility updated'})

    # DELETE: delete specific access
    if request.method == 'DELETE':
        role = data.get('role')
        user_id = data.get('user_id')

        # Search for an exactly matching record
        vis = ProjectVisibility.query.filter_by(
            project_path=project_file,
            role=role,
            user_id=user_id
        ).first()

        if not vis:
            return jsonify({'success': False, 'error': 'Such access not found'})

        db.session.delete(vis)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Access removed'})


# Define role-based permissions
ROLE_PERMISSIONS = {
    'admin': None,         # None means full access
    'user': ['viewer', 'user'],
    'viewer': ['viewer'],
}


def load_visibility_map():
    """
    Load all visibility records grouped by project_path.
    Returns a dict: { project_path: [visibility_records, ...], ... }
    """
    vis_map = defaultdict(list)
    for v in ProjectVisibility.query.all():
        vis_map[v.project_path].append(v)
    return vis_map


def can_access(project_path: str, user) -> bool:
    """
    Determine if `user` can access project at `project_path`.
    Individual grants always override role restrictions.
    """
    visibilities = VISIBILITY_MAP.get(project_path, [])
    # Public if no records
    if not visibilities:
        return True
    # Individual grant override
    if any(v.user_id == user.id for v in visibilities):
        return True
    # Admin sees everything
    if user.role == 'admin':
        return True
    # Role-based grants
    permitted = ROLE_PERMISSIONS.get(user.role, []) or []
    if any(v.user_id is None and v.role in permitted for v in visibilities):
        return True
    # No access
    return False

from collections import defaultdict

@app.route('/library', methods=['GET'])
@login_required
def library():
    # Load directory listing safely
    try:
        all_projects = [p for p in os.listdir(PROJECTS_DIR)
                        if os.path.isdir(os.path.join(PROJECTS_DIR, p))]
    except FileNotFoundError:
        all_projects = []

    # Preload all visibility records
    global VISIBILITY_MAP
    VISIBILITY_MAP = load_visibility_map()

    # Filter projects by access
    allowed_projects = [p for p in all_projects
                        if can_access(os.path.join(PROJECTS_DIR, p), current_user)]

    # Sort and paginate
    favorites = load_favorites()
    favorite_projects = [p for p in allowed_projects if p in favorites]
    other_projects = [p for p in allowed_projects if p not in favorites]
    projects_to_display = favorite_projects + other_projects

    page = int(request.args.get('page', 1))
    per_page = 20
    start = (page - 1) * per_page
    end = start + per_page
    page_items = projects_to_display[start:end]
    has_more = end < len(projects_to_display)

    return render_template(
        'index.html',
        projects=page_items,
        favorites=favorites,
        current_page=page,
        has_more=has_more
    )

@app.route('/search_projects', methods=['GET'])
@login_required
def search_projects():
    query = request.args.get('query', '').strip().lower()
    try:
        # Load project list
        all_projects = [p for p in os.listdir(PROJECTS_DIR)
                        if os.path.isdir(os.path.join(PROJECTS_DIR, p))]

        # Preload visibility records
        global VISIBILITY_MAP
        VISIBILITY_MAP = load_visibility_map()

        allowed = []
        for project_name in all_projects:
            # Apply search filter
            if query and query not in project_name.lower():
                continue

            project_path = os.path.join(PROJECTS_DIR, project_name)
            if can_access(project_path, current_user):
                allowed.append(project_name)

        allowed.sort()
        offset = int(request.args.get('offset', 0))
        limit = int(request.args.get('limit', 10))
        paginated = allowed[offset: offset + limit]

        return jsonify({'success': True, 'projects': paginated})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
        

@app.route('/search_user')
@login_required
@roles_required('user', 'admin')
def search_user():
    q = request.args.get('q', '').strip()
    if len(q) < 2:
        return jsonify({'success': False, 'error': 'Query is too short', 'users': []})

    users = User.query.filter(User.username.ilike(f'%{q}%')).limit(10).all()
    users_data = [{'id': u.id, 'username': u.username, 'role': u.role} for u in users]
    return jsonify({'success': True, 'users': users_data})



# ===================== Admin Routes =====================
# Access for admin only
@app.route('/admin', methods=['GET', 'POST'])
@login_required
@roles_required("admin")
def admin():
    form = CreateUserForm()
    if form.validate_on_submit():
        if User.query.filter_by(username=form.username.data).first():
            flash("User already exists!", "warning")
        else:
            new_user = User(
                username=form.username.data,
                password=form.password.data,
                role=form.role.data
            )
            db.session.add(new_user)
            db.session.commit()
            flash(f"User {form.username.data} created!", "success")
    users = User.query.all()
    return render_template("admin.html", form=form, users=users)

# Deleting users – access for admin only
@app.route('/delete_user', methods=["POST"])
@login_required
@roles_required("admin")
def delete_user():
    user_id = request.form.get("user_id")
    user = User.query.get(user_id)
    if user:
        if user.id == current_user.id:
            flash("You cannot delete yourself", "danger")
        else:
            db.session.delete(user)
            db.session.commit()
            flash("User deleted", "success")
    else:
        flash("User not found", "warning")
    return redirect(url_for("admin"))

# ===========================================
# Endpoint for Storage_api
# ===========================================

@app.route('/storage_api', methods=['GET', 'DELETE'])
@login_required
@roles_required("user", "admin")
def storage_api():
    # For a GET request, we expect project_name in the query parameters,
    # for DELETE – either in form or in JSON
    if request.method == 'GET':
        project_name = request.args.get('project_name')
    else:
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form
        project_name = data.get('project_name')

    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'}), 400

    project_path = os.path.join(PROJECTS_DIR, project_name)
    if not os.path.exists(project_path):
        return jsonify({'success': False, 'error': 'Project not found'}), 404

    if request.method == 'GET':
        try:
            # Get only files, excluding index.html (case-insensitive)
            files = [
                f for f in os.listdir(project_path)
                if os.path.isfile(os.path.join(project_path, f)) and f.lower() != 'index.html'
            ]
            return jsonify({'success': True, 'files': files})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500


    elif request.method == 'DELETE':
        # Expecting the "files" parameter to contain a list of filenames (or a single name)
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form
        files_to_delete = data.get('files')
        if not files_to_delete:
            return jsonify({'success': False, 'error': 'No files specified'}), 400
        if isinstance(files_to_delete, str):
            files_to_delete = [files_to_delete]

        errors = []
        for filename in files_to_delete:
            file_path = os.path.join(project_path, filename)
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                else:
                    errors.append(f"File {filename} not found.")
            except Exception as e:
                errors.append(f"Error deleting {filename}: {str(e)}")
        if errors:
            return jsonify({'success': False, 'error': errors}), 500
        return jsonify({'success': True})


@app.route('/storage_open', methods=['GET'])
@login_required
@roles_required("admin")
def storage_open():
    project_name = request.args.get('project_name')
    if not project_name:
        return jsonify({'success': False, 'error': 'Project name required'}), 400

    project_path = os.path.join(PROJECTS_DIR, project_name)
    if not os.path.exists(project_path):
        return jsonify({'success': False, 'error': 'Project not found'}), 404

    try:
        if os.name == 'nt':  # Windows
            os.startfile(project_path)
        elif sys.platform == 'darwin':  # macOS
            subprocess.Popen(['open', project_path])
        else:  # Linux and others
            subprocess.Popen(['xdg-open', project_path])
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

from wtforms import BooleanField
from sqlalchemy import case, func
from sortedcontainers import SortedList


# Endpoint for serving files from the files folder
@app.route('/files/<path:filename>', methods=['GET'])
def serve_files(filename):
    # Base directory for files
    base_dir = os.path.join(os.getcwd(), 'templates', 'files')
    # Form the full path to the file
    file_path = os.path.join(base_dir, filename)
    
    # If the requested file does not exist or is a directory, return 404
    if not os.path.exists(file_path) or os.path.isdir(file_path):
        abort(404)
    
    # Serve the file from the corresponding directory.
    # as_attachment=False — the file will be opened inline (if the browser can display it)
    directory = os.path.dirname(file_path)
    file_name = os.path.basename(file_path)
    return send_from_directory(directory, file_name, as_attachment=False)


# ------------------- Public Access  -------------------

# New model for storing information about public project access
class SharedProject(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    share_id = db.Column(db.String(100), unique=True, nullable=False)  # Access identifier, set by the user
    project_path = db.Column(db.String(200), nullable=False)  # Absolute path to the project file


@app.route('/open/<share_id>', methods=['GET'])
def open_shared_project(share_id):
    shared = SharedProject.query.filter_by(share_id=share_id).first()
    if shared:
        if os.path.exists(shared.project_path):
            try:
                with open(shared.project_path, 'r', encoding='utf-8') as f:
                    project_content = f.read()
                # Render the template without the toolbar and project list
                return render_template('shared_project.html', project_content=project_content)
            except Exception as e:
                return render_template('error.html', error=str(e)), 500
        else:
            return render_template('error.html', error='Project file not found'), 404
    else:
        return render_template('error.html', error='Public access for this identifier was not found. Please select a project for public access.'), 404


@app.route('/access', methods=['GET', 'POST', 'DELETE'])
@login_required
@roles_required("user", "admin")
def manage_access():
    # Determine the project name depending on the request type:
    if request.method == 'GET':
        project_name = request.args.get('project_name')
    else:
        # For POST and DELETE, try to get data in JSON format,
        # if not JSON, then from form data.
        data = request.get_json() if request.is_json else request.form
        project_name = data.get('project_name')
    
    if not project_name:
        return jsonify({'success': False, 'error': 'Project name (project_name) must be specified'})
    
    project_file = os.path.join(PROJECTS_DIR, project_name, 'index.html')
    if not os.path.exists(project_file):
        return jsonify({'success': False, 'error': 'Project not found'})
    
    if request.method == 'GET':
        # Check if the project is open for public access
        shared = SharedProject.query.filter_by(project_path=project_file).first()
        if shared:
            share_url = url_for('open_shared_project', share_id=shared.share_id, _external=True)
            return jsonify({'success': True, 'access': True, 'share_url': share_url})
        else:
            return jsonify({
                'success': True,
                'access': False,
                'message': 'The project is not open for public access. Specify a share_id to open access.'
            })
    
    elif request.method == 'POST':
        # Get data from the request (JSON expected)
        data = request.get_json() if request.is_json else request.form
        share_id = data.get('share_id')
        if not share_id:
            return jsonify({'success': False, 'error': 'share_id must be specified'})
        
        # Check if this share_id is already in use
        if SharedProject.query.filter_by(share_id=share_id).first():
            return jsonify({'success': False, 'error': 'This share_id is already in use'})
        
        new_shared = SharedProject(share_id=share_id, project_path=project_file)
        db.session.add(new_shared)
        db.session.commit()
        share_url = url_for('open_shared_project', share_id=share_id, _external=True)
        return jsonify({'success': True, 'message': 'Access granted', 'share_url': share_url})
    
    elif request.method == 'DELETE':
        # Revoke public access – delete the record from the database
        shared = SharedProject.query.filter_by(project_path=project_file).first()
        if not shared:
            return jsonify({'success': False, 'error': 'Public access for this project not found'})
        db.session.delete(shared)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Public access closed'})

@app.route('/get_project_name/<share_id>', methods=['GET'])
def get_project_name(share_id):
    shared = SharedProject.query.filter_by(share_id=share_id).first()
    if shared:
        # Get the project name from the path
        project_name = os.path.basename(os.path.dirname(shared.project_path))
        return jsonify({'success': True, 'project_name': project_name})
    else:
        return jsonify({'success': False, 'error': 'Public access for this identifier not found'}), 404

# --------------------------- Pomodoro

@app.route('/pomidoro', methods=['GET', 'POST'])
@login_required
def pomidoro():
    try:
        default_settings = {
            'work': 25,         # work minutes
            'short_break': 5,   # short break (min)
            'long_break': 15,   # long break (min)
            'cycles': 4         # number of cycles (work + short break) before a long break
        }
        
        if request.method == 'GET':
            timer = session.get('pomidoro_timer')
            if timer:
                now = time.time()
                elapsed = now - timer['start_time']
                remaining = timer['duration'] - elapsed
                # If the time has expired and "Accept" has not yet been pressed, set the waiting flag
                if remaining <= 0:
                    if not timer.get('waiting_for_accept', False):
                        timer['waiting_for_accept'] = True
                        session['pomidoro_timer'] = timer
                    remaining = 0
                state = {
                    'phase': timer['phase'],
                    'remaining': int(remaining),
                    'cycle': timer.get('cycle', 0),
                    'waiting': timer.get('waiting_for_accept', False)
                }
                return jsonify(success=True, timer=state)
            else:
                settings = session.get('pomidoro_settings', default_settings)
                return jsonify(success=True, settings=settings)
    
        elif request.method == 'POST':
            data = request.get_json()
            if not data:
                return jsonify(success=False, error="No data"), 400
            
            # If settings are passed, save them
            if data.get('settings'):
                session['pomidoro_settings'] = data['settings']
            
            action = data.get('action')
            if action == 'start':
                settings = session.get('pomidoro_settings', default_settings)
                timer = {
                    'phase': 'work',
                    'start_time': time.time(),
                    'duration': settings['work'] * 60,
                    'cycle': 0
                }
                session['pomidoro_timer'] = timer
                return jsonify(success=True, message="Timer started", timer=timer)
            elif action == 'stop':
                session.pop('pomidoro_timer', None)
                return jsonify(success=True, message="Timer stopped")
            elif action == 'accept':
                timer = session.get('pomidoro_timer')
                if timer and timer.get('waiting_for_accept'):
                    settings = session.get('pomidoro_settings', default_settings)
                    # If the current phase is "work", increment the cycle counter and select a break
                    if timer['phase'] == 'work':
                        timer['cycle'] = timer.get('cycle', 0) + 1
                        if timer['cycle'] % settings['cycles'] == 0:
                            timer['phase'] = 'long_break'
                            timer['duration'] = settings['long_break'] * 60
                        else:
                            timer['phase'] = 'short_break'
                            timer['duration'] = settings['short_break'] * 60
                    else:
                        # If it was a break phase, switch to work
                        timer['phase'] = 'work'
                        timer['duration'] = settings['work'] * 60
                    timer.pop('waiting_for_accept', None)
                    timer['start_time'] = time.time()
                    session['pomidoro_timer'] = timer
                    return jsonify(success=True, message="Timer resumed", timer=timer)
                else:
                    return jsonify(success=False, error="Not waiting for confirmation"), 400
            # If no action is passed, return success on saving settings
            return jsonify(success=True, message="Settings saved")
    except Exception as e:
        app.logger.error("Error in /pomidoro: %s", e)
        return jsonify(success=False, error=str(e)), 500


# ------------------- Application Start -------------------
def load_user_config():
    with open('user_config.json', 'r') as f:
        return json.load(f)

if __name__ == '__main__':
    user_data = load_user_config()
    with app.app_context():
        db.create_all()
        if not User.query.filter_by(username=user_data["username"]).first():
            admin_user = User(
                username=user_data["username"],
                password=user_data["password"],
                role=user_data["role"]
            )
            db.session.add(admin_user)
            db.session.commit()
    app.run(host='0.0.0.0', port=8000, debug=False, use_reloader=False)