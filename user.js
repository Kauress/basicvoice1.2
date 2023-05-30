class UserManager {
  users = [];
  activeUser = null;

  insertUser(user) {
    this.users.push(user);
    return this.users.length - 1;
  }

  getUserIndex(userId) {
    return this.users.findIndex((user) => user.userId === userId);
  }

  updateUserId(username, userId) {
    let userIndex = this.users.findIndex((user) => user.username === username);
    if (userIndex > -1) this.users[userIndex].userId = userId;
    else {
      this.users.push({ userId, username });
      userIndex = this.users.length - 1;
    }
    return userIndex;
  }

  removeUser(userId) {
    const userIndex = this.users.findIndex((us) => us.userId === userId);
    const user = this.users[userIndex];
    this.users.splice(userIndex, 1);
    return {
      index: userIndex,
      user,
    };
  }

  assignUser(userIndex) {
    this.activeUser = this.users[userIndex];
    return this.activeUser;
  }
}

module.exports = UserManager;
