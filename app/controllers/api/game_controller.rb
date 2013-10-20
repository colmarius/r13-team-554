class Api::GameController < ApplicationController
  respond_to :json
  protect_from_forgery with: :null_session

  def index
    genre = params[:genre]
    render json: GameEntry.create_new(genre).to_json
  end

  def create
    genre = Genre.where(name: params[:genre]).first
    genre ||= Genre.first
    game = GameGenerator.create_game(nil, genre)
    render json: {
      id: game.id,
      tracks: game.quizzes.map { |q|
        {
          id: q.id,
          url: q.right_answer.audio_clip_url,
          valid_choices: q.options.map { |o|
            {
              id: o.echonest_track_id,
              title: o.title,
              audio_clip_url: o.audio_clip_url,
              artist: o.artist.name
            }
          }
        }
      }
    }
  end

  def check
    game_id = params[:id]
    track_id = params[:track_id]
    render json: { status: ['good', 'bad'].sample }
  end
end
