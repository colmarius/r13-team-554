Game = function(options) {
  this.id = options.id;
  this.tracks = new TrackListItemsCollection(options.trackList.tracks);
  this.currentAnswers = new AnswerItemsCollection({
    url: options.answersUrl
  });
  this.currentTrack = -1;
  this.currentClip = null;
  this.trackViews = [];
  this.timer = false;
  this.time = options.time || 60000;
  this.timeIncrement = 10;
  this.status = 0;
  this.closedAnswers = 0;

  this.init(options);
  this.bindEvents();
}

Game.prototype.init = function(options) {
  // Game status
  this.gameStatus = new GameStatusView({genre: options.genre});

  // Game controls
  this.gameControls = new GameControlsView();

  // Track views
  var self = this;
  this.tracks.each(function(track) {
    var view = new TrackListItemView({
      model: track
    });

    self.trackViews.push(view);
  });

  // Answers view
  this.answersView = new GameAnswersView();

  // Events mixin
  _.extend(this, Backbone.Events);
}

Game.prototype.start = function() {
  this.gameStatus.render();
  this.gameControls.render();
  _.each(this.trackViews, function(view) {
    view.render();
  });
}

Game.prototype.bindEvents = function() {
  this.bind('skipTrack', this.skipTrack);
  this.bind('resumeTimer', this.resumeTimer);
  this.bind('pauseTimer', this.pauseTimer);
  this.bind('answersRendered', this.answersRendered);
  this.bind('answersRemoved', this.answersRemoved);
  this.bind('answerSelected', this.answerSelected);
}

Game.prototype.skipTrack = function() {
  this.currentTrack += 1;
  if(this.currentTrack >= this.tracks.length) {
    this.currentTrack = 0;
  }

  while(this.tracks.at(this.currentTrack) && this.tracks.at(this.currentTrack).get('status') != 0) {
    this.currentTrack += 1;
  }

  this.trackTransition();
}

Game.prototype.trackTransition = function() {
  if(this.currentClip) {
    this.currentClip.stop();
  } else {
    game.trigger('pauseTimer', this);
  }

  // Deactivate bullets
  var self = this;
  _.each(this.trackViews, function(view) {
    view.deactivate();
    view.slide(self.currentTrack);
  });

  $('#track-list').animate({
    'margin-top': 200 - this.currentTrack * 95
  }, 500);
  this.answersView.remove();
}

Game.prototype.playTrack = function(index) {
  var track = this.tracks.at(index);
  var clip = track.get('clipSound');

  // Refresh ui
  this.trackViews[index].activate();

  // Unbind events
  if(this.currentClip) {
    this.currentClip.stop();
    this.currentClip.unbind('play');
    this.currentClip.unbind('pause');
    this.currentClip.unbind('timeupdate');
  }

  // Bind events
  this.currentClip = clip;

  this.currentClip.bind('timeupdate', function() {
    game.trigger('timeUpdate', this.getDuration(), this.getTime());
  });

  this.currentClip.bind('play', function() {
    game.trigger('resumeTimer', this);
  });

  this.currentClip.bind('pause', function() {
    game.trigger('pauseTimer', this);
  });

  this.currentClip.bind('ended', function() {
    game.trigger('resumeTimer', this);
  });

  // Play clip
  clip.play();
}

Game.prototype.resumeTimer = function(clip) {
  var self = this;
  this.timer = setInterval(function() {
    self.timerTick();
  }, this.timeIncrement);
}

Game.prototype.pauseTimer = function() {
  clearInterval(this.timer);
}

Game.prototype.timerTick = function() {
  this.time -= this.timeIncrement;
  this.trigger('timerTick', this.time);

  if(this.time <= 0) {
    this.trigger('pauseTimer');
    this.gameOver();
  }
}

Game.prototype.answersRendered = function() {
  this.playTrack(this.currentTrack);
}

Game.prototype.answersRemoved = function() {
  this.checkProgress();
}

Game.prototype.checkProgress = function() {
  var answeredTracks = this.tracks.filter(function(track) {
    return track.get('status') != 0;
  });
  if(answeredTracks.length == this.tracks.length) {
    this.gameOver();
  } else {
    var trackModel = this.tracks.at(this.currentTrack);
    this.currentAnswers.reset(trackModel.get('answers'));
    this.answersView.model = trackModel;
    this.answersView.render();
  }

  this.trigger('answerConfirmed', answeredTracks.length, this.tracks.length);
}

Game.prototype.answerSelected = function(track, answerCid) {
  var answer = this.currentAnswers.get(answerCid);
  var self = this;
  answer.save({
    track_id: track.id
  }, {
    success: function() {
      self.answerChecked.apply(self, arguments);
    }
  });
}


Game.prototype.answerChecked = function(answer) {
  var track = this.tracks.get(answer.get('track_id'));
  var result = answer.get('result') == 'correct' ? 2: 1;
  track.set({
    status: result,
    artist: answer.get('correct').artist,
    title: answer.get('correct').title,
    answer_id: answer.get('answer_id')
  });

  this.trigger('skipTrack');
}

Game.prototype.gameOver = function() {
  var answers = this.tracks.map(function(track) {
    return {
      track_id: track.id,
      answer_id: track.get('answer_id')
    }
  });

  var self = this;
  $.ajax({
    url: '/api/game/'+ this.id +'/check',
    data: {
      answers: answers
    },
    type: 'post',
    success: function(result) {
      self.finalScreen(result);
    }
  });
}

Game.prototype.finalScreen = function(result) {
  var rightTracks = this.tracks.filter(function(track) {
    return track.get('status') == 2;
  });

  var self = this;
  $('#content').fadeOut(400, function() {
    $(this).remove();
    self.gameEndingView = new GameEndingView({
      model: {
        title: result.status == 'good' ? 'You made it!': 'Quite there!',
        ratio: rightTracks.length + '/' + self.tracks.length,
        points: 1000 * rightTracks.length + self.time
      }
    });
    self.gameEndingView.render()
  });
}