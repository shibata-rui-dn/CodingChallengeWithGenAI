class User {
  constructor(data) {
    this.id = data.id;
    this.username = data.username;
    this.email = data.email;
    this.firstName = data.first_name;
    this.lastName = data.last_name;
    this.isActive = data.is_active;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  static fromDatabase(row) {
    return new User(row);
  }

  toJSON() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
      isActive: this.isActive
    };
  }
}

export default User;