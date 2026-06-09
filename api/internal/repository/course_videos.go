package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CourseVideo is one lesson in a course product: a YouTube video + a markdown
// description, ordered within the course.
type CourseVideo struct {
	ID            uuid.UUID
	ProductID     uuid.UUID
	Title         string
	YouTubeURL    string
	DescriptionMD string
	SortOrder     int
	CreatedAt     time.Time
}

type CourseVideoInput struct {
	Title         string
	YouTubeURL    string
	DescriptionMD string
}

type CourseVideoRepo struct {
	pool *pgxpool.Pool
}

func NewCourseVideoRepo(pool *pgxpool.Pool) *CourseVideoRepo {
	return &CourseVideoRepo{pool: pool}
}

func (r *CourseVideoRepo) ListByProduct(ctx context.Context, productID uuid.UUID) ([]CourseVideo, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, product_id, title, youtube_url, description_md, sort_order, created_at
		FROM course_videos
		WHERE product_id = $1
		ORDER BY sort_order ASC, created_at ASC
	`, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CourseVideo
	for rows.Next() {
		var v CourseVideo
		if err := rows.Scan(&v.ID, &v.ProductID, &v.Title, &v.YouTubeURL,
			&v.DescriptionMD, &v.SortOrder, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// ReplaceForProduct nukes existing videos and inserts the new list in order.
// Course playlists are small, so delete-then-insert is simpler than diffing
// (same approach as ProductDiscountRepo.Replace / VariantRepo.ReplaceForProduct).
// sort_order is the index in the supplied slice. Rows with an empty youtube_url
// are skipped (the handler already validates, this is belt-and-suspenders).
func (r *CourseVideoRepo) ReplaceForProduct(ctx context.Context, productID uuid.UUID, inputs []CourseVideoInput) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM course_videos WHERE product_id = $1`, productID); err != nil {
		return err
	}
	for i, in := range inputs {
		if in.YouTubeURL == "" {
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO course_videos (product_id, title, youtube_url, description_md, sort_order)
			VALUES ($1, $2, $3, $4, $5)
		`, productID, in.Title, in.YouTubeURL, in.DescriptionMD, i); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
